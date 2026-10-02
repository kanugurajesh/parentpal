import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";
import { z } from "zod";
import { GoalCategory, GoalSlug } from "@parentpal/shared";

const here = path.dirname(fileURLToPath(import.meta.url));
export const CONTENT_DIR = path.resolve(here, "../../../../content");

const SourceFile = z.array(
  z.object({
    id: z.string(),
    title: z.string(),
    publisher: z.string(),
    url: z.string().url(),
    accessedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }),
);

const Frontmatter = z.object({
  slug: GoalSlug,
  title: z.string(),
  subtitle: z.string(),
  category: GoalCategory,
  illustration: z.string(),
  sort: z.number().int(),
  sources: z.array(z.string()).default([]),
});

export interface ParsedWin {
  id: string;
  position: number;
  title: string;
  action: string;
  script: string;
  whatToExpect: string;
  sourceIds: string[];
}
export interface ParsedChunk {
  id: string;
  winId: string | null;
  heading: string;
  body: string;
}
export interface ParsedGoal {
  slug: z.infer<typeof GoalSlug>;
  title: string;
  subtitle: string;
  category: z.infer<typeof GoalCategory>;
  illustration: string;
  sort: number;
  intro: string;
  sourceIds: string[];
  wins: ParsedWin[];
  chunks: ParsedChunk[];
}

function splitSections(body: string, level: string): { heading: string; text: string }[] {
  const re = new RegExp(`^${level} (.+)$`, "gm");
  const out: { heading: string; text: string }[] = [];
  const matches = [...body.matchAll(re)];
  matches.forEach((m, i) => {
    const start = m.index! + m[0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index! : body.length;
    out.push({ heading: m[1].trim(), text: body.slice(start, end).trim() });
  });
  return out;
}

const ids = (s: string) =>
  s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

export function loadContent(dir = CONTENT_DIR) {
  const sources = SourceFile.parse(JSON.parse(fs.readFileSync(path.join(dir, "sources.json"), "utf8")));
  const sourceIds = new Set(sources.map((s) => s.id));
  const checkSources = (where: string, list: string[]) => {
    for (const id of list) if (!sourceIds.has(id)) throw new Error(`${where}: unknown source id "${id}"`);
  };

  const goalFiles = fs.readdirSync(path.join(dir, "goals")).filter((f) => f.endsWith(".md"));
  const goals: ParsedGoal[] = goalFiles.map((file) => {
    const raw = fs.readFileSync(path.join(dir, "goals", file), "utf8");
    const { data, content } = matter(raw);
    const fm = Frontmatter.parse(data);
    if (`${fm.slug}.md` !== file) throw new Error(`${file}: slug "${fm.slug}" must match filename`);
    checkSources(file, fm.sources);

    const firstSection = content.search(/^## /m);
    const intro = (firstSection === -1 ? content : content.slice(0, firstSection)).trim();
    const sections = splitSections(content, "##");

    const wins: ParsedWin[] = [];
    const chunks: ParsedChunk[] = [];
    let bg = 0;
    if (intro && sections.length) chunks.push({ id: `${fm.slug}:intro`, winId: null, heading: fm.title, body: intro });

    for (const sec of sections) {
      if (sec.heading.startsWith("Background:")) {
        const heading = sec.heading.replace("Background:", "").trim();
        const srcLine = sec.text.match(/^Sources:\s*(.+)$/m);
        if (srcLine) checkSources(`${file} › ${heading}`, ids(srcLine[1]));
        const text = sec.text.replace(/^Sources:.*$/m, "").trim();
        chunks.push({ id: `${fm.slug}:bg-${++bg}`, winId: null, heading, body: text });
      } else if (sec.heading.startsWith("Win:")) {
        const title = sec.heading.replace("Win:", "").trim();
        const parts = Object.fromEntries(splitSections(sec.text, "###").map((p) => [p.heading.toLowerCase(), p.text]));
        const need = ["action", "say this", "what to expect", "sources"];
        for (const n of need) if (!parts[n]) throw new Error(`${file} › "${title}": missing "### ${n}"`);
        const position = wins.length + 1;
        const win: ParsedWin = {
          id: `${fm.slug}-${position}`,
          position,
          title,
          action: parts["action"],
          script: parts["say this"].replace(/^"|"$/g, ""),
          whatToExpect: parts["what to expect"],
          sourceIds: ids(parts["sources"]),
        };
        checkSources(`${file} › "${title}"`, win.sourceIds);
        wins.push(win);
        chunks.push({
          id: win.id,
          winId: win.id,
          heading: title,
          body: `${win.action}\nSay: "${win.script}"\nWhat to expect: ${win.whatToExpect}`,
        });
      } else {
        throw new Error(`${file}: unknown section "## ${sec.heading}" (use "Win:" or "Background:")`);
      }
    }

    return {
      slug: fm.slug,
      title: fm.title,
      subtitle: fm.subtitle,
      category: fm.category,
      illustration: fm.illustration,
      sort: fm.sort,
      intro,
      sourceIds: fm.sources,
      wins,
      chunks,
    };
  });

  return { sources, goals: goals.sort((a, b) => a.sort - b.sort) };
}
