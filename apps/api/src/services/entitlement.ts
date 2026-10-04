import { eq } from "drizzle-orm";
import { db, schema } from "../db/client";

/** Free users get win 1 of every goal; the rest of the library needs an active subscription. */
export async function isSubscribed(userId: string) {
  const [sub] = await db
    .select({ status: schema.subscriptions.status })
    .from(schema.subscriptions)
    .where(eq(schema.subscriptions.userId, userId));
  return sub?.status === "active_fake";
}
