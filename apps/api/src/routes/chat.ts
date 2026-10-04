import { and, desc, eq } from "drizzle-orm";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { ChatMessage, Feedback, SendMessage, Topic, type ChatStreamEvent } from "@parentpal/shared";
import { db, schema } from "../db/client";
import { requireUser } from "../lib/auth";
import { notFound } from "../lib/errors";
import { clearChat, listMessages, runChat, startersFor, toChatMessages, TOPICS } from "../services/chat";
import { loadFamilyContext } from "../services/context";
import { llmLimit } from "../lib/rateLimit";

const MsgParams = z.object({ id: z.string().uuid() });

/** A message belongs to the caller only if it's in one of their conversations (bookmarks outlive a cleared chat). */
async function ownedMessage(userId: string, messageId: string) {
  const [row] = await db
    .select({ m: schema.messages })
    .from(schema.messages)
    .innerJoin(schema.conversations, eq(schema.conversations.id, schema.messages.conversationId))
    .where(and(eq(schema.messages.id, messageId), eq(schema.conversations.userId, userId)));
  if (!row) throw notFound("Message");
  return row.m;
}

export const chatRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook("preHandler", requireUser);

  app.get("/chat", { schema: { response: { 200: z.object({ messages: z.array(ChatMessage) }) } } }, async (req) => ({
    messages: await listMessages(req.userId),
  }));

  /** Clears the chat: next messages start a new conversation with no history. Bookmarked replies are kept. */
  app.delete("/chat", { schema: { response: { 200: z.object({ messages: z.array(ChatMessage) }) } } }, async (req) => {
    await clearChat(req.userId);
    return { messages: [] };
  });

  app.get(
    "/chat/starters",
    { schema: { querystring: z.object({ childId: z.string().uuid().optional() }), response: { 200: z.object({ starters: z.array(z.string()) }) } } },
    async (req) => {
      const ctx = await loadFamilyContext(req.userId, req.query.childId);
      return { starters: startersFor(ctx.goals.map((g) => g.slug), ctx.children[0]?.nickname) };
    },
  );

  app.get("/chat/topics", { schema: { response: { 200: z.object({ topics: z.array(Topic) }) } } }, async () => ({ topics: TOPICS }));

  /**
   * Server-Sent Events. Each line is `data: <ChatStreamEvent JSON>\n\n`.
   * Sequence: user → meta → delta* → done (or error).
   */
  app.post("/chat/messages", { config: llmLimit.chat, schema: { body: SendMessage } }, async (req, reply) => {
    reply.hijack();
    const raw = reply.raw;
    raw.writeHead(200, {
      ...(reply.getHeaders() as Record<string, string>), // keeps CORS headers set by @fastify/cors
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    const send = (e: ChatStreamEvent) => raw.write(`data: ${JSON.stringify(e)}\n\n`);
    let closed = false;
    // The response socket closing is what signals the client went away; the request stream has already ended.
    raw.on("close", () => (closed = true));
    try {
      for await (const event of runChat(req.userId, req.body)) {
        if (closed) break;
        send(event);
      }
    } catch (err) {
      req.log.error(err);
      if (!closed) send({ type: "error", message: "Something went wrong on our side. Try again." });
    } finally {
      raw.end();
    }
  });

  app.post(
    "/messages/:id/feedback",
    { schema: { params: MsgParams, body: Feedback, response: { 200: ChatMessage } } },
    async (req) => {
      const m = await ownedMessage(req.userId, req.params.id);
      await db
        .insert(schema.messageFeedback)
        .values({ messageId: m.id, userId: req.userId, rating: req.body.rating })
        .onConflictDoUpdate({
          target: [schema.messageFeedback.messageId, schema.messageFeedback.userId],
          set: { rating: req.body.rating, createdAt: new Date() },
        });
      const [out] = await toChatMessages(req.userId, [m]);
      return out;
    },
  );

  app.post("/messages/:id/bookmark", { schema: { params: MsgParams, response: { 200: ChatMessage } } }, async (req) => {
    const m = await ownedMessage(req.userId, req.params.id);
    await db.insert(schema.bookmarks).values({ userId: req.userId, messageId: m.id }).onConflictDoNothing();
    const [out] = await toChatMessages(req.userId, [m]);
    return out;
  });

  app.delete("/messages/:id/bookmark", { schema: { params: MsgParams, response: { 200: ChatMessage } } }, async (req) => {
    const m = await ownedMessage(req.userId, req.params.id);
    await db.delete(schema.bookmarks).where(and(eq(schema.bookmarks.userId, req.userId), eq(schema.bookmarks.messageId, m.id)));
    const [out] = await toChatMessages(req.userId, [m]);
    return out;
  });

  app.get("/bookmarks", { schema: { response: { 200: z.object({ messages: z.array(ChatMessage) }) } } }, async (req) => {
    const rows = await db
      .select({ m: schema.messages })
      .from(schema.bookmarks)
      .innerJoin(schema.messages, eq(schema.messages.id, schema.bookmarks.messageId))
      .where(eq(schema.bookmarks.userId, req.userId))
      .orderBy(desc(schema.bookmarks.createdAt));
    return { messages: await toChatMessages(req.userId, rows.map((r) => r.m)) };
  });
};
