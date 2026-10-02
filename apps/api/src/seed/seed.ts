import path from "node:path";
import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";
import { db, schema, sqlClient } from "../db/client";
import { loadContent } from "./content";

/**
 * Idempotent: content tables are upserted/replaced from /content, user data is untouched.
 * Wins and chunks are deleted and re-inserted, so renaming a win in markdown just works.
 */
export async function seedContent() {
  const { sources, goals } = loadContent();

  await db.transaction(async (tx) => {
    for (const s of sources) {
      await tx
        .insert(schema.sources)
        .values(s)
        .onConflictDoUpdate({
          target: schema.sources.id,
          set: { title: s.title, publisher: s.publisher, url: s.url, accessedOn: s.accessedOn },
        });
    }

    for (const g of goals) {
      const row = {
        slug: g.slug,
        title: g.title,
        subtitle: g.subtitle,
        intro: g.intro,
        category: g.category,
        illustration: g.illustration,
        hasContent: g.wins.length > 0,
        sourceIds: g.sourceIds,
        sort: g.sort,
      };
      await tx.insert(schema.goals).values(row).onConflictDoUpdate({ target: schema.goals.slug, set: row });
      await tx.delete(schema.contentChunks).where(sql`${schema.contentChunks.goalSlug} = ${g.slug}`);
      await tx.delete(schema.wins).where(sql`${schema.wins.goalSlug} = ${g.slug}`);
      if (g.wins.length) await tx.insert(schema.wins).values(g.wins.map((w) => ({ ...w, goalSlug: g.slug })));
      if (g.chunks.length)
        await tx.insert(schema.contentChunks).values(g.chunks.map((c) => ({ ...c, goalSlug: g.slug })));
    }
  });

  return {
    goals: goals.length,
    wins: goals.reduce((n, g) => n + g.wins.length, 0),
    chunks: goals.reduce((n, g) => n + g.chunks.length, 0),
    sources: sources.length,
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  seedContent()
    .then((r) => console.log(`✓ seeded ${r.goals} goals, ${r.wins} wins, ${r.chunks} chunks, ${r.sources} sources`))
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(() => sqlClient.end());
}
