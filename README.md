# davisbuilds.net

Source for [davisbuilds.net](https://davisbuilds.net): essays, the agent
tooling I build, oneshot demos, and readouts of real activity data.

A static [Astro](https://astro.build) site with no runtime third-party
requests. Essays are written in Obsidian and imported with
`scripts/import-essay.mjs`; oneshot demos come from
[davisbuilds/oneshots](https://github.com/davisbuilds/oneshots) at a pinned
commit and run in sandboxed, offline frames.

```bash
pnpm install --frozen-lockfile
pnpm dev     # local dev server
pnpm test    # unit tests, fixture build, Playwright e2e, internal link check
```

`AGENTS.md` has the conventions the code follows. This is a personal site, so
I'm not taking contributions.

© Davis Gee. All rights reserved. The source is public to read; the code,
essays and images aren't licensed for reuse.
