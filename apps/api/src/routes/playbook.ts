import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { CreateCaregiver, CreateCaregiverResponse, PlaybookResponse, SetPlaybookWins } from "@parentpal/shared";
import { requireUser } from "../lib/auth";
import { addCaregiver, getPlaybook, revokeCaregiver, setPlaybookWins } from "../services/playbook";

/** Family Playbook, parent side: choose what to share and with whom. The caregiver page lives in publicPlaybook.ts. */
export const playbookRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook("preHandler", requireUser);

  app.get("/playbook", { schema: { response: { 200: PlaybookResponse } } }, (req) => getPlaybook(req.userId));

  app.put("/playbook/wins", { schema: { body: SetPlaybookWins, response: { 200: PlaybookResponse } } }, (req) =>
    setPlaybookWins(req.userId, req.body.winIds),
  );

  app.post("/caregivers", { schema: { body: CreateCaregiver, response: { 200: CreateCaregiverResponse } } }, (req) =>
    addCaregiver(req.userId, req.body),
  );

  app.delete("/caregivers/:id", { schema: { params: z.object({ id: z.string().uuid() }) } }, (req) => revokeCaregiver(req.userId, req.params.id));
};
