import { sqlClient } from "../db/client";
import { runDailyTips } from "../services/dailyTips";

/** Manual / external-cron entrypoint: `npm run -w @parentpal/api jobs:daily-tips` */
runDailyTips()
  .then((r) => console.log(`✓ daily tips for ${r.forDate}: ${r.created} created, ${r.skipped} already had one`))
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => sqlClient.end());
