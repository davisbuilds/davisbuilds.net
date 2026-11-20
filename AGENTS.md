# AGENTS.md

Personal website for Davis Gee at **davisbuilds.net**: essays, agent tooling,
oneshot demos, and readouts of real activity data. An Astro static site;
the repository is public.

## Public Repository, Private Companion

Everything committed here is public: code, tests, fixtures, comments, commit
messages and PR text. CI's Publication Hygiene workflow runs
`python3 scripts/check_publication_hygiene.py`, which fails on a literal home
path or on an email address that `.publication-hygiene.json` doesn't allow. It
doesn't cover commit messages, PR text, or the built site; the deploy's
private-name scan covers the build.

The owner's checkout also holds a gitignored **private companion repository**
at `private/`, with `docs/` linked into it (`docs -> private/docs`). It holds
the web server's config and the deploy and telemetry forced commands with
their container rehearsal (`private/server/`), checks that hold that config to
this build (`private/tests/`, run by Vitest when present), the private project
names the deploy scan adds to the owner's private GitHub repositories
(`private/names.txt`), and `docs/`: specs, plans, the operations runbook and
the backlog. Write those under `docs/` as usual; they land in the private
repository. Never copy their content, private project names, local paths or
host details into tracked files. A public clone has neither path, and
everything here builds and tests without them; only a deploy needs `private/`.

## Verification

- **Gate:** `pnpm check` (typecheck, unit tests, fixture build, the bad-essay
  build failure, e2e and the internal link check). CI also runs
  `pnpm test:browser-runtime`, `pnpm build` then `node scripts/check-demos.mjs`,
  and the hygiene script; run those when a change touches the browser setup,
  oneshots or tracked text.
- **E2E** runs Playwright against `astro preview` of the fixture build on port
  4391 and never reuses a running server, so a `pnpm dev` on 4321 can't stand
  in. The fixture build uses `tests/fixtures/`, never real drafts.
- **UI changes:** also check the page in a real browser at desktop width and
  at 390 px, in light and dark, and with reduced motion on.
- **Toolchain:** TypeScript stays on 6 because `astro check` doesn't support 7
  yet. Build-script approvals and the 7-day release quarantine live in
  `pnpm-workspace.yaml`; pnpm 11 ignores the `package.json` `pnpm` field.
- **Deploys are manual and owner-only** (`scripts/deploy.mjs` deploys
  `origin/main`, `scripts/rollback.mjs` restores the previous release; the
  private runbook has the procedure). Merging to `main` doesn't deploy.

## Implementation Guardrails

- **Public output, private inputs.** Anything that reaches the built site is
  public. Never ship private repository names, session or prompt content, file
  paths, unpublished essays, or credentials. `scripts/deploy.mjs` refuses a
  build that names any of the owner's private projects; the list is read at
  deploy time, never stored here.
- **Essays are the owner's words.** Agents may set up, format, and validate
  essays. They don't draft or rewrite essay prose, and they don't set an
  essay's `published` date without the owner's say-so.
- **Numbers show their source and age.** Never hard-code a telemetry value into
  a page. An unavailable source renders as "unavailable", never as zero.
- **Deploys touch only this site's docroot,** through a limited deploy
  identity. Anything needing root on the server needs the owner's approval
  each time.
- **Links to other sites open in a new tab** via `src/middleware.ts`, so
  components and essay Markdown don't set `target` or `rel` themselves.

## Essays

- One Markdown file per essay in `src/content/writing/`; the file name is the
  slug. `src/lib/essay-schema.ts` enforces frontmatter, and unknown keys fail
  the build.
- Margin notes are Markdown footnotes turned into margin notes by
  `rehype-sidenotes`, so Markdown runs on Astro's `unified()` processor rather
  than the default Sätteri.
- Essays are written in Obsidian and copied in with
  `node scripts/import-essay.mjs "<note>.md"` (`--dry-run` previews). It drops
  vault-only keys and the `writing` tag, and refuses blank fields, schema
  failures, `ai-generated` notes, and Obsidian-only syntax. Edit the note, not
  the copy, and re-run it.
- `getPublishedEssays()` in `src/lib/writing.ts` is the only way pages, the
  feed and the palette read essays. Keep it that way.

## Oneshots

- Runs come from `davisbuilds/oneshots` at the commit pinned in
  `src/data/oneshots.lock.json`; `pnpm dev` and `pnpm build` sync them first
  (`pnpm sync` alone) into gitignored `src/generated/oneshots/` and
  `public/oneshots/`.
- **Bumping the lock** is a reviewed commit: edit the lock, run `pnpm sync`
  and read the demo files changed since the lock at HEAD (`--since <sha>` for
  another baseline), then `pnpm build` and `node scripts/check-demos.mjs`,
  which plays every demo in its sandbox and fails on any off-host request,
  error or blank frame.
- **Briefs** show up to the oneshots `<!-- after delivery -->` line
  (`splitBrief` in `src/lib/oneshots/sync.ts`). A repeated or differently
  cased or spaced marker fails the sync; other typos pass, so read the run page
  after a lock bump.
- **Demos are untrusted code.** They run only in `sandbox="allow-scripts"`
  frames (`DEMO_SANDBOX`) behind a CSP that keeps them offline. A new CDN file
  or font goes into `src/lib/oneshots/vendor-map.ts` from a pinned package;
  anything unmapped fails the sync.
- **A demo is served as one page.** The host's bot check answers any request
  without its cookie with a challenge page, and a sandboxed frame never sends
  that cookie. So the sync writes scripts, plain stylesheets and fonts into the
  page. An external module entry is bundled from relative `.js` and `.mjs`
  imports confined to its run, and local TTF or WOFF2 files referenced by
  stylesheets are embedded as data URLs. The lock bump's source review includes
  those modules and fonts. Local previews have no bot check, so `check-demos`
  fails any second request.
- **Link previews** use a 1200×630 crop of the run's hero
  (`src/lib/oneshots/social.ts`) as `og:image` with a large `twitter:card`.
  Cards won't render live while the bot check answers preview fetchers.

## Systems

- `src/data/parts.ts` lists public repositories only, plus products the owner
  chose to name (Habits AI, without a link). Its `APPS` drives the Systems
  catalogue, featured Home cards and `llms.txt`; `url` is the live
  destination, and `repo` is optional and always public.
- A `publishedBrand` exception needs the owner's explicit permission and
  publishes only that display name and curated live URL, never source URLs;
  other destinations and built paths stay guarded.
- Dates come from GitHub (`src/lib/github.ts`), never from the file. A part
  that isn't a public repository fails the production build; fixture builds
  read `tests/fixtures/github/repos.json`.

## Home Intro

- On a first visit a pixel crew builds Home's first screen, then the page
  fades in (3 s). An inline script in `src/pages/index.astro` decides before
  first paint. It never plays with reduced motion, a `#…` link, unreadable
  storage, or `navigator.webdriver`; `/?intro` forces it, and the page shows
  after 5 s if the script never runs.
- `src/lib/intro.ts` plans the choreography from the page's own selectors, so
  a Home layout change changes the intro with it.
- Playwright sets `navigator.webdriver`, so tests see the plain page;
  `tests/e2e/intro.spec.ts` opts in with an init script.

## Telemetry

- One document, `/telemetry.json`, read in the browser by
  `src/scripts/telemetry-reader.ts`. `src/lib/telemetry-schema.ts` is its
  allowlist; a new field or label goes there first, or validation fails.
- `node scripts/telemetry/snapshot.mjs --dry-run` reads GitHub (the `gh`
  login) and this host's agentmonitor and prints a validated document;
  `scripts/telemetry/validate.mjs` checks any document (`--previous` applies
  the year-to-date rule).
- Fixtures never ship: the build has no `telemetry.json`, e2e tests serve
  `tests/fixtures/telemetry/` through a route, and a site deploy never writes
  the document.

## Working Agreement

- **Clarify before building** when a request is vague, contradictory, or skips a
  key decision; clear, well-scoped requests need no interview.
- **Fix small issues now; backlog the rest.** Fix simple, quick, or blocking
  issues in this repo as part of the current change and call them out. Record in
  `docs/project/BACKLOG.md` only what can't be finished now or needs the
  maintainer's decision; don't open a branch or PR just for a backlog entry.
- **Keep docs current** when a change makes a documented contract, boundary,
  procedure, or direction stale, including a spec's lifecycle `status` and the
  runbook when the deploy procedure changes.
- **Planning and continuity.** Reuse clear task context; save planning docs when
  decisions, acceptance, or coordination need persistence. Leave a brief handoff
  only when needed to resume unfinished work. Commit shared docs and keep status
  current. Before archiving, preserve lasting decisions and open work in
  maintained docs and repair links.
- **TDD:** red/green for features, major refactors and large changes; the red
  test must fail on the behavior, not on a missing symbol. For smaller edits, run
  the relevant existing checks.
- **Commit and push.** Commit coherent chunks, staging by explicit path. Push
  your task branch and open a PR once the work is complete and the local gate
  passes; don't push directly to `main`.
- **Merge** only under the standing merge authority in the maintainer's
  workspace instructions, or when the maintainer asks. Without those
  instructions in context, leave the PR for the maintainer.
- **Re-ground after compaction** in source, this file, the owning docs, and
  recent commits. A summary and your own earlier proposals are not user approval.
- CI runs on GitHub-hosted runners only; never point a workflow at a
  self-hosted runner.

## Git

Merge with a merge commit, or rebase when clean commits read better; squash is
disabled and merged branches are deleted. `main` requires the `test` (Site
checks) and `check` (Publication Hygiene) jobs; renaming either means updating
branch protection in the same change. Site checks' `test` job only requires
its gate and demo jobs, which run in parallel; add any new Site checks job to
its `needs`.
