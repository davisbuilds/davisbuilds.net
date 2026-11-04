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

Chromium projects use installed Google Chrome with a separate temporary Playwright
profile. Install Chrome before browser tests; run `pnpm test:browser-runtime` to
check the version guard. The suite's global setup rejects Chrome older than
156.0.8078.79 (CVE-2026-76024) before loading test pages. Playwright 1.64.1's bundled
Chromium 156.0.8078.4 does not meet this floor. Project names and snapshot paths
remain `chromium`.

`PLAYWRIGHT_CHROME_EXECUTABLE_PATH` can select an explicitly provisioned Chrome
for Testing executable; its actual reported version must pass the same guard.
There is no fallback to bundled Chromium. macOS uses its installed Chrome and
Chromium sandbox. Hosted Ubuntu x64 CI provisions the pinned official Chrome for
Testing 156.0.8078.80 archive with a recorded SHA-256; self-hosted macOS checks the
existing app without overwriting a shared browser. The checksum pins the reviewed
HTTPS download, and is not an independently published vendor signature.
Revisit the temporary browser choice when a stable Playwright browser manifest
includes the fix; qualify that browser through the consumer tests before changing
back. This version floor addresses the named CVE, not all future browser advisories.
