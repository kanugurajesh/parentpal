import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "../db/client";
import { notFound } from "./errors";

export type ChildRow = typeof schema.children.$inferSelect;

/**
 * The child a request is about: the one asked for (must be the user's own, else 404), or the
 * first child when none is given, which keeps older app versions and single-child families working.
 * Null only when the user has no children yet and none was asked for.
 */
export async function pickChild(userId: string, childId?: string): Promise<ChildRow | null> {
  if (childId) {
    const [c] = await db
      .select()
      .from(schema.children)
      .where(and(eq(schema.children.id, childId), eq(schema.children.userId, userId)));
    if (!c) throw notFound("Child");
    return c;
  }
  const [first] = await db.select().from(schema.children).where(eq(schema.children.userId, userId)).orderBy(asc(schema.children.createdAt)).limit(1);
  return first ?? null;
}
