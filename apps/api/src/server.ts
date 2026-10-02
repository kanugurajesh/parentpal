import cron from "node-cron";
import { buildApp } from "./app";
import { env } from "./env";
import { llm } from "./llm";
import { runDailyTips } from "./services/dailyTips";

const app = await buildApp();

// In-process scheduler. Fine for a single instance; see DECISIONS.md for the multi-instance story.
cron.schedule(env.DAILY_TIP_CRON, async () => {
  try {
    const r = await runDailyTips();
    app.log.info(r, "daily tips job finished");
  } catch (err) {
    app.log.error(err, "daily tips job failed");
  }
});

await app.listen({ port: env.PORT, host: "0.0.0.0" });
app.log.info(`LLM provider: ${llm.info.provider} (${llm.info.model}); daily tips cron "${env.DAILY_TIP_CRON}"`);
