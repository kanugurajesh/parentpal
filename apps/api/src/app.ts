import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import Fastify from "fastify";
import {
  hasZodFastifySchemaValidationErrors,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";
import { env } from "./env";
import { HttpError } from "./lib/errors";
import { llm } from "./llm";
import { adminRoutes } from "./routes/admin";
import { authRoutes } from "./routes/auth";
import { chatRoutes } from "./routes/chat";
import { communityRoutes } from "./routes/community";
import { goalRoutes } from "./routes/goals";
import { meRoutes } from "./routes/me";
import { notificationRoutes } from "./routes/notifications";
import { playbookRoutes } from "./routes/playbook";
import { progressRoutes } from "./routes/progress";
import { publicPlaybookRoutes } from "./routes/publicPlaybook";
import { storyRoutes } from "./routes/story";

export async function buildApp() {
  const app = Fastify({
    logger: env.isTest ? false : { level: "info", transport: undefined },
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(cors, { origin: true, methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"] });
  await app.register(jwt, { secret: env.JWT_SECRET });

  app.setErrorHandler((err, _req, reply) => {
    if (hasZodFastifySchemaValidationErrors(err)) {
      const first = err.validation[0];
      const field = first?.instancePath?.replace(/^\//, "").replace(/\//g, ".") || "request";
      return reply.status(400).send({ error: "invalid_request", message: `${field}: ${first?.message ?? "is invalid"}` });
    }
    if (err instanceof HttpError) return reply.status(err.statusCode).send({ error: "http_error", message: err.message });
    const status = (err as { statusCode?: number }).statusCode;
    if (status && status < 500) return reply.status(status).send({ error: "http_error", message: (err as Error).message });
    app.log.error(err);
    return reply.status(500).send({ error: "server_error", message: "Something went wrong on our side. Try again." });
  });

  app.get("/health", async () => ({ ok: true, llm: llm.info }));

  // Family Playbook pages for caregivers: public, outside /v1 (no app, no login; the link is the key).
  await app.register(publicPlaybookRoutes);

  await app.register(
    async (v1) => {
      await v1.register(authRoutes);
      await v1.register(meRoutes);
      await v1.register(goalRoutes);
      await v1.register(storyRoutes);
      await v1.register(progressRoutes);
      await v1.register(chatRoutes);
      await v1.register(notificationRoutes);
      await v1.register(communityRoutes);
      await v1.register(playbookRoutes);
      await v1.register(adminRoutes);
    },
    { prefix: "/v1" },
  );

  return app;
}
