# AGENTS.md

Personal website for Davis Gee at **davisbuilds.net**: essays, agent tooling,
oneshot demos, and readouts of real activity data. An Astro static site;
the repository is public.

## Public Repository, Private Companion

This repository is public, so everything committed here is public: code,
tests, fixtures, comments, commit messages and PR text. CI's Publication
Hygiene workflow runs `python3 scripts/check_publication_hygiene.py`, which
fails on a literal home path or on an email address that
`.publication-hygiene.json` doesn't allow. It doesn't cover commit messages,
PR text, or the built site; the deploy's private-name scan covers the build.

The owner's checkout also holds a **private companion repository** at
`private/`, with `docs/` linked into it (`docs -> private/docs`). Both paths
are gitignored. It keeps what doesn't belong in public:

- `private/server/`: the web server's config, the deploy and telemetry
  forced commands, and their container rehearsal;
- `private/tests/`: checks that hold that config to this build (Vitest runs
  them when present);
- `private/names.txt`: private project names the deploy scan adds to the
  owner's private GitHub repositories;
- `docs/`: specs, plans, the operations runbook and the backlog.

Write specs, plans and backlog entries under `docs/` as usual; they land in
the private repository. Never copy their content, private project names,
local paths or host details into tracked files. A public clone has neither
path, and everything here builds and tests without them; only a deploy needs
`private/`.

## Command Quickstart

```bash
pnpm install --frozen-lockfile
pnpm dev                    # local dev server
pnpm check                  # the gate CI runs; run before pushing: typecheck, then test
pnpm typecheck              # astro check (TypeScript 6; astro check doesn't support TS 7 yet)
pnpm test                   # unit, bad-essay build failure, fixture build, e2e, internal link check
node scripts/deploy.mjs     # deploy origin/main (owner only; see docs/system/OPERATIONS.md)
node scripts/rollback.mjs   # back to the previous release
node scripts/lighthouse.mjs # accessibility, Home's transfer budget, no third-party requests
node scripts/import-essay.mjs "<vault note>.md"  # copy a vault essay in (see Essays)
```

pnpm is pinned to 10.28.1 via `packageManager`. The global pnpm may be 11,
which ignores this repo's `pnpm.onlyBuiltDependencies`, so let corepack select
the pinned version.

## Implementation Guardrails

- **Public output, private inputs.** Anything that reaches the built site is
  public. Never ship:
  - private repository names, session or prompt content, or file paths;
  - unpublished essays;
  - credentials of any kind.
  `scripts/deploy.mjs` refuses a build that names any of the owner's private
  projects; the list is read at deploy time, never stored here.
- **Essays are the owner's words.** Agents may set up, format, and validate
  essays. They don't draft or rewrite essay prose, and they don't set an
  essay's `published` date without the owner's say-so.
- **Numbers show their source and age.** Never hard-code a telemetry value into
  a page. An unavailable source renders as "unavailable", never as zero.
- **Deploys touch only this site's docroot,** through a limited deploy
  identity. Anything needing root on the server needs the owner's approval
  each time.
- **Links to other sites open in a new tab.** `src/middleware.ts` adds
  `target="_blank" rel="noopener"` to every rendered page, so components and
  essay Markdown don't set it themselves.

## Essays

- **Location:** one Markdown file per essay in `src/content/writing/`. The file
  name is the URL slug (`/writing/<slug>/`).
- **Frontmatter:** `src/lib/essay-schema.ts` enforces it.
  Unknown keys fail the build, so a misspelled field can't pass silently.
- **Margin notes:** written as Markdown footnotes (`[^name]`). The
  `rehype-sidenotes` plugin turns them into margin notes, so Markdown runs on
  Astro's `unified()` processor rather than the default Sätteri.
- **From the vault:** essays are written in Obsidian and copied in with `node scripts/import-essay.mjs "<note>.md"` (`--dry-run`
  prints the result). It drops vault-only keys and the `writing` tag, and
  refuses blank fields, values the schema rejects, `ai-generated` notes, and
  Obsidian-only syntax. Edit the note, not the copy, and re-run it.
- **Publishing:** `getPublishedEssays()` in `src/lib/writing.ts` is the only
  way pages, the feed and the palette read essays. Keep it that way.

## Oneshots

- **Source:** runs come from `davisbuilds/oneshots` at the commit pinned in
  `src/data/oneshots.lock.json`. `pnpm dev` and `pnpm build` sync them first
  (`pnpm sync` on its own), into `src/generated/oneshots/` and
  `public/oneshots/`, both gitignored.
- **Bumping the lock** is a reviewed commit. Edit the lock, run `pnpm sync`
  and read the list of demo files changed since the lock at HEAD (or
  `pnpm sync --since <sha>` for any other baseline). Then run
  `node scripts/check-demos.mjs` after `pnpm build`. That plays every demo in
  its sandbox and fails on any request to another host, error or blank
  frame.
- **Briefs** show up to the oneshots `<!-- after delivery -->` line
  (`splitBrief` in `src/lib/oneshots/sync.ts`); a repeated marker, or one
  in another case or spacing, fails the sync. Other typos pass unnoticed, so
  read the run page after a lock bump.
- **Demos are untrusted code.** They run only in `sandbox="allow-scripts"`
  frames (`DEMO_SANDBOX`), behind a CSP that keeps them offline. A new CDN
  file or font goes into `src/lib/oneshots/vendor-map.ts` from a pinned
  package; anything unmapped fails the sync.

## Systems

- **Parts:** `src/data/parts.ts` lists public repositories only, plus
  products the owner chose to name (Habits AI, without a link).
- **Dates come from GitHub** (`src/lib/github.ts`), never from the file. A
  part that isn't a public repository fails the production build; fixture
  builds read `tests/fixtures/github/repos.json`.

## Telemetry

- **One document,** `/telemetry.json`, read in the browser by
  `src/scripts/telemetry-reader.ts`. `src/lib/telemetry-schema.ts` is its
  allowlist; a new field or label goes there first, or validation fails.
- **The operator snapshot:** `node scripts/telemetry/snapshot.mjs --dry-run`
  reads GitHub (the `gh` login) and this host's agentmonitor, and
  prints a validated document. `scripts/telemetry/validate.mjs` checks any
  document, and `--previous` applies the year-to-date rule.
- **Fixtures never ship.** The build has no `telemetry.json`; e2e tests serve
  `tests/fixtures/telemetry/` through a route. A site deploy never writes
  the document.

## Testing

- **Unit tests:** Vitest, in `tests/unit/`.
- **E2E:** Playwright against `astro preview` of the fixture build, in
  `tests/e2e/`. It serves on port 4391 and never reuses a running server, so
  a `pnpm dev` on 4321 can't stand in for the build. The fixture build uses `tests/fixtures/` for content (and,
  later, telemetry), never real drafts.
- **Assertions about absence need a working detector.** A "zero" check (no
  animations, no broken links, no forbidden writes) comes with a control
  showing it can see the positive case.
- For UI changes, also check the page in a real browser at desktop width and
  at 390 px, in light and dark, and with reduced motion on.

## Working Agreement

- Commit coherent chunks and stage by explicit path. Push only when asked.
- Pull requests run CI on GitHub-hosted runners only; never point a workflow
  at a self-hosted runner.
- Update a spec's lifecycle `status` as work lands, and
  `docs/system/OPERATIONS.md` when the deploy procedure changes.
