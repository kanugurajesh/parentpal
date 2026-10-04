import rateLimit from "@fastify/rate-limit";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { HttpError } from "./errors";

/**
 * Who a request counts against: the signed-in user when the token verifies (so parents behind one
 * home or office IP don't share a budget), otherwise the IP. An unverified token falls back to the
 * IP, so forging tokens can't spread one person's requests across many buckets.
 */
function keyFor(req: FastifyRequest) {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    try {
      return `user:${req.server.jwt.verify<{ sub: string }>(header.slice(7)).sub}`;
    } catch {
      // fall through to IP
    }
  }
  return `ip:${req.ip}`;
}

const byIp = (req: FastifyRequest) => `ip:${req.ip}`;

const limit = (max: number, timeWindow: string, keyGenerator = keyFor) => ({ rateLimit: { max, timeWindow, keyGenerator } });

/** Account routes, keyed by IP: they run before (or without) a session, and are what scripts target. */
export const authLimit = {
  guest: limit(20, "1 hour", byIp),
  register: limit(10, "1 hour"),
  login: limit(10, "15 minutes", byIp),
  forgot: limit(5, "1 hour", byIp),
  reset: limit(10, "15 minutes", byIp),
};

/** Routes that call the LLM, which is what costs money. Sized well above what one parent does by hand. */
export const llmLimit = {
  chat: limit(40, "1 hour"),
  moment: limit(30, "1 hour"),
  pattern: limit(10, "1 hour"),
  caregiver: limit(20, "1 hour", byIp),
};

/** Everything else gets a generous ceiling that only a script would reach. */
export async function registerRateLimits(app: FastifyInstance) {
  await app.register(rateLimit, {
    global: true,
    max: 300,
    timeWindow: "1 minute",
    keyGenerator: keyFor,
    // Thrown, then rendered by the app's error handler like any other HttpError.
    errorResponseBuilder: (_req, ctx) =>
      new HttpError(429, `Too many requests. Try again in ${ctx.after}.`),
  });
}
