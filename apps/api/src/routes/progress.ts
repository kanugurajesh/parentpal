import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { ProgressResponse, ReportOutcome, ReportOutcomeResponse, StartTry, WinTry } from "@parentpal/shared";
import { requireUser } from "../lib/auth";
import { getProgress, reportOutcome, startTry } from "../services/progress";

export const progressRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook("preHandler", requireUser);

  app.post("/tries", { schema: { body: StartTry, response: { 200: WinTry } } }, async (req) => startTry(req.userId, req.body));

  app.post(
    "/tries/:id/outcome",
    { schema: { params: z.object({ id: z.string().uuid() }), body: ReportOutcome, response: { 200: ReportOutcomeResponse } } },
    async (req) => reportOutcome(req.userId, req.params.id, req.body),
  );

  app.get(
    "/progress",
    { schema: { querystring: z.object({ childId: z.string().uuid().optional() }), response: { 200: ProgressResponse } } },
    async (req) => getProgress(req.userId, req.query.childId),
  );
};
