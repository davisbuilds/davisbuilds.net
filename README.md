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

## Browser runtime

macOS Chromium projects use installed Google Chrome with a separate temporary
Playwright profile and Chromium sandbox. Run `pnpm test:browser-runtime` to
exercise the actual root configuration and version guard. The global setup
rejects versions older than 156.0.8078.79 (CVE-2026-76024) before loading pages.
Project names and snapshot paths remain `chromium`.

Hosted Ubuntu x64 CI installs Chromium from the locked Playwright 1.65.0 graph
into a fresh runner-temporary cache and exports its full browser path through
`PLAYWRIGHT_CHROME_EXECUTABLE_PATH`. This retires the separate Chrome-for-Testing
archive pin. Explicit executable overrides pass the same actual-version guard;
there is no silent fallback. Self-hosted macOS checks the existing app without
overwriting a shared browser. The version floor addresses the named CVE, not
all future browser advisories.
