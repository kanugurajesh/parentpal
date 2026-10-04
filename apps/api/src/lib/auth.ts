import { randomBytes, randomInt, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { eq } from "drizzle-orm";
import type { FastifyReply, FastifyRequest } from "fastify";
import { db, schema } from "../db/client";
import { env } from "../env";
import { HttpError } from "./errors";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

/** scrypt from node:crypto: no native build step on Windows/macOS/Linux. */
export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [algo, saltB64, keyB64] = stored.split("$");
  if (algo !== "scrypt" || !saltB64 || !keyB64) return false;
  const expected = Buffer.from(keyB64, "base64");
  const actual = await scrypt(password, Buffer.from(saltB64, "base64"), expected.length);
  return timingSafeEqual(actual, expected);
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    /** sv: users.session_version when the token was issued. Tokens from before it existed have none (= 0). */
    payload: { sub: string; sv?: number };
    user: { sub: string; sv?: number };
  }
}

declare module "fastify" {
  interface FastifyRequest {
    userId: string;
  }
}

/**
 * preHandler: valid JWT *and* the user still exists (deleted accounts are locked out immediately)
 * *and* the token is from the current session version (a password reset signs out other devices).
 */
export async function requireUser(req: FastifyRequest) {
  try {
    await req.jwtVerify();
  } catch {
    throw new HttpError(401, "Sign in again to continue.");
  }
  const [u] = await db
    .select({ id: schema.users.id, sessionVersion: schema.users.sessionVersion })
    .from(schema.users)
    .where(eq(schema.users.id, req.user.sub));
  if (!u) throw new HttpError(401, "This profile no longer exists. Start a new profile to continue.");
  if ((req.user.sv ?? 0) !== u.sessionVersion) throw new HttpError(401, "Your password was changed. Sign in again to continue.");
  req.userId = u.id;
}

/** 6-digit codes for "forgot password", zero-padded so every code is the same length. */
export function newResetCode() {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export async function requireAdmin(req: FastifyRequest, _reply: FastifyReply) {
  const given = req.headers["x-admin-key"];
  const a = Buffer.from(typeof given === "string" ? given : "");
  const b = Buffer.from(env.ADMIN_KEY);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new HttpError(403, "Admin key required.");
}
