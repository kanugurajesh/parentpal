/** Migrates + seeds the dedicated test database once per run. */
export default async function setup() {
  process.env.NODE_ENV = "test";
  const { runMigrations } = await import("../src/db/migrate");
  const { seedContent } = await import("../src/seed/seed");
  const { sqlClient } = await import("../src/db/client");
  await runMigrations();
  await seedContent();
  await sqlClient`TRUNCATE users, llm_calls CASCADE`;
  await sqlClient.end();
}
