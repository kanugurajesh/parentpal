import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  AgeBand,
  BlockInput,
  CirclesResponse,
  CreatePost,
  CreatePostResponse,
  CreateReply,
  CreateReplyResponse,
  FeedResponse,
  GoalSlug,
  PostDetail,
  ReactInput,
  ReactionKind,
  ReportInput,
} from "@parentpal/shared";
import { requireUser } from "../lib/auth";
import { block, createPost, createReply, deleteOwn, feed, getPost, listCircles, react, report } from "../services/community";

const Id = z.object({ id: z.string().uuid() });

/** Circles: anonymous groups by goal, with posts tagged by the child's age band. */
export const communityRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook("preHandler", requireUser);

  app.get("/circles", { schema: { response: { 200: CirclesResponse } } }, (req) => listCircles(req.userId));

  app.get(
    "/circles/:goal/posts",
    {
      schema: {
        params: z.object({ goal: GoalSlug }),
        querystring: z.object({ band: z.union([AgeBand, z.literal("all")]).default("all"), cursor: z.string().datetime().optional() }),
        response: { 200: FeedResponse },
      },
    },
    (req) => feed(req.userId, req.params.goal, { band: req.query.band, cursor: req.query.cursor }),
  );

  app.post(
    "/circles/:goal/posts",
    { schema: { params: z.object({ goal: GoalSlug }), body: CreatePost, response: { 200: CreatePostResponse } } },
    (req) => createPost(req.userId, req.params.goal, req.body),
  );

  app.get("/posts/:id", { schema: { params: Id, response: { 200: PostDetail } } }, (req) => getPost(req.userId, req.params.id));

  app.delete("/posts/:id", { schema: { params: Id } }, (req) => deleteOwn(req.userId, "post", req.params.id));

  app.post(
    "/posts/:id/replies",
    { schema: { params: Id, body: CreateReply, response: { 200: CreateReplyResponse } } },
    (req) => createReply(req.userId, req.params.id, req.body.body),
  );

  app.delete("/replies/:id", { schema: { params: Id } }, (req) => deleteOwn(req.userId, "reply", req.params.id));

  app.post(
    "/reactions",
    {
      schema: {
        body: ReactInput,
        response: { 200: z.object({ reactions: z.object({ same: z.number(), helpful: z.number() }), myReactions: z.array(ReactionKind) }) },
      },
    },
    (req) => react(req.userId, req.body.targetType, req.body.targetId, req.body.kind),
  );

  app.post("/reports", { schema: { body: ReportInput } }, (req) => report(req.userId, req.body.targetType, req.body.targetId, req.body.reason));

  app.post("/blocks", { schema: { body: BlockInput } }, (req) => block(req.userId, req.body.targetType, req.body.targetId));
};
