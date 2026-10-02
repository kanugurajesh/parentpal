# Content

Everything the app teaches lives here as plain files. Edit, then run `npm run -w @parentpal/api db:seed`.

- `sources.json`: every source a goal or win can cite. URLs were opened on the `accessedOn` date.
- `goals/<slug>.md`: one file per goal. Frontmatter = card metadata. Body:
  - The first paragraph(s) before any `##` = the goal intro.
  - `## Background: <heading>`: a retrievable chunk that is not a win.
  - `## Win: <title>`: a win. It must contain `### Action`, `### Say this`, `### What to expect`, `### Sources` (comma-separated source ids).
  - Win order = position. Position 1 is free; the rest need a (fake) subscription.
- A goal with no `## Win` sections is shown as "Coming soon".

The seed script fails loudly on a missing section or unknown source id.

**Editorial rule:** wording is original and each win cites where the idea comes from. Don't add a claim you can't point to in a source here. This is general guidance, not medical advice. A qualified reviewer should check it before real users see it.
