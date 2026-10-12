#!/usr/bin/env node
// Lighthouse accessibility, Home's transfer
// budget, and no requests to third-party hosts, measured on the built site
// served the way nginx serves it (gzip level 1 on the same types).
//
//   node scripts/lighthouse.mjs [--no-build] [--no-demos]
//
// --no-build audits whatever dist/ already holds, for both phases. A page
// that build lacks fails the run: Lighthouse refuses a non-200 document
// (ERRORED_DOCUMENT_REQUEST) rather than scoring the 404 page.
//
// It builds twice. The fixture build supplies the essay page, because no
// essay is published at launch and the template is what's being measured.
// The production build, built last so dist/ is left as production, supplies
// every other page. Each page is audited at mobile and desktop settings, and
// every page must score at least 95 for accessibility, in the light and the
// dark color scheme. Then
// check-demos.mjs plays each runnable demo for 10 seconds and fails on any
// request to another host.
//
// Before trusting a clean result, a control page with a third-party image and
// known accessibility faults must trip both detectors.
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { chromium } from '@playwright/test';
import lighthouse, { desktopConfig } from 'lighthouse';

const args = process.argv.slice(2);
const PORT = 4394, DEBUG_PORT = 9334;
const ORIGIN = `http://localhost:${PORT}`;
const A11Y_FLOOR = 95;
const HOME_BUDGET = 150 * 1024; // compressed HTML + CSS + JS, excluding fonts and images
const OUT = '.lighthouse';
const CONTROL = '/__lighthouse-control/';
const SCHEME_CONTROL = '/__lighthouse-scheme/';

// The same types nginx gzips (private/server/nginx/davisbuilds.net.conf), plus
// HTML, which nginx always compresses.
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'application/javascript', '.json': 'application/json',
  '.xml': 'text/xml', '.txt': 'text/plain', '.md': 'text/markdown', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif', '.mp4': 'video/mp4',
};
const GZIP = new Set(['.html', '.css', '.js', '.json', '.xml', '.txt', '.md', '.svg']);

const CONTROL_PAGE = `<!doctype html><html><head><title>control</title></head><body>
<img src="https://example.com/lighthouse-control.png"><a href="#"></a>
<p style="color:#eee;background:#fff">low contrast</p><input type="text"></body></html>`;
// Readable except under one color scheme, so a contrast failure proves the
// run really emulated that scheme.
const schemeControl = (scheme) => `<!doctype html><html lang="en"><head><title>scheme control</title>
<style>body{background:#fff;color:#000}@media (prefers-color-scheme:${scheme}){p{color:#f4f4f4}}</style></head>
<body><main><h1>Scheme control</h1><p>Unreadable only under the ${scheme} scheme.</p></main></body></html>`;
const SCHEMES = ['light', 'dark'];

function serve(dir, extra = {}) {
  dir = path.resolve(dir);
  const server = createServer((req, res) => {
    const url = new URL(req.url, ORIGIN);
    if (extra[url.pathname]) {
      const [type, body] = extra[url.pathname];
      res.writeHead(200, { 'content-type': type, 'cache-control': 'no-cache' });
      return res.end(body);
    }
    let file = path.join(dir, decodeURIComponent(url.pathname));
    if (!file.startsWith(dir + path.sep)) return res.writeHead(400).end();
    try {
      if (statSync(file).isDirectory()) file = path.join(file, 'index.html');
      statSync(file);
    } catch {
      file = path.join(dir, '404.html');
      res.statusCode = 404;
    }
    const ext = path.extname(file);
    let body = readFileSync(file);
    const headers = { 'content-type': TYPES[ext] ?? 'application/octet-stream' };
    if (GZIP.has(ext) && /\bgzip\b/.test(req.headers['accept-encoding'] ?? '')) {
      body = gzipSync(body, { level: 1 });
      headers['content-encoding'] = 'gzip';
      headers.vary = 'Accept-Encoding';
    }
    res.writeHead(res.statusCode, headers).end(body);
  });
  return new Promise((resolve) => server.listen(PORT, 'localhost', () => resolve(server)));
}

function build(script) {
  console.log(`\n== pnpm ${script}`);
  const r = spawnSync('pnpm', [script], { stdio: ['ignore', 'ignore', 'inherit'] });
  if (r.status !== 0) throw new Error(`pnpm ${script} failed`);
}

// Playwright's own Chromium, with a debugging port Lighthouse connects to.
// `scheme` sets prefers-color-scheme (Blink: 0 dark, 1 light); left alone,
// headless Chrome follows the operating system's setting.
async function startChrome(scheme) {
  const profile = mkdtempSync(path.join(os.tmpdir(), 'dbs-lh-'));
  const proc = spawn(chromium.executablePath(), [
    '--headless=new', `--blink-settings=preferredColorScheme=${scheme === 'dark' ? 0 : 1}`, `--remote-debugging-port=${DEBUG_PORT}`, `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--disable-extensions', 'about:blank',
  ], { stdio: ['ignore', 'ignore', process.env.LH_CHROME_LOG ? 'inherit' : 'ignore'] });
  // Listen from spawn: if Chromium dies mid-audit, a listener attached later
  // would never fire and the cleanup would wait forever.
  const exited = new Promise((r) => proc.once('exit', r));
  for (let i = 0; ; i++) {
    try {
      if ((await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`)).ok) break;
    } catch {}
    if (i > 100) {
      proc.kill();
      throw new Error('Chromium did not open its debugging port');
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  // Wait for the exit: until then the old process still answers on the
  // debugging port, and the next run's readiness check would find it.
  return async () => {
    proc.kill();
    await exited;
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  };
}

async function audit(pathname, form, scheme) {
  const flags = { port: DEBUG_PORT, output: 'json', logLevel: 'error', onlyCategories: ['accessibility', 'performance'] };
  const result = await lighthouse(`${ORIGIN}${pathname}`, flags, form === 'desktop' ? desktopConfig : undefined);
  const lhr = result.lhr;
  if (lhr.runtimeError) throw new Error(`${pathname} (${form}): ${lhr.runtimeError.code} ${lhr.runtimeError.message}`);
  const requests = lhr.audits['network-requests'].details.items;
  const failing = Object.values(lhr.audits)
    .filter((a) => lhr.categories.accessibility.auditRefs.some((r) => r.id === a.id && r.weight > 0) && a.score !== null && a.score < 1)
    .map((a) => a.id);
  const name = `${pathname.replace(/\W+/g, '-').replace(/^-|-$/g, '') || 'home'}-${form}-${scheme}`;
  writeFileSync(path.join(OUT, `${name}.json`), JSON.stringify(lhr));
  return {
    pathname, form, scheme,
    a11y: Math.round(lhr.categories.accessibility.score * 100),
    perf: Math.round(lhr.categories.performance.score * 100),
    failing,
    thirdParty: requests.map((r) => r.url).filter((u) => /^https?:/.test(u) && new URL(u).origin !== ORIGIN),
    transfer: requests.filter((r) => ['Document', 'Stylesheet', 'Script'].includes(r.resourceType))
      .reduce((sum, r) => sum + (r.transferSize ?? 0), 0),
  };
}

const problems = [];
mkdirSync(OUT, { recursive: true });
const telemetry = ['application/json', readFileSync('tests/fixtures/telemetry/ok.json')];

const phases = [
  // The fixture build: the essay template, with fixture content.
  { script: 'build:fixtures', pages: ['/writing/published-essay/'] },
  // Production last, so dist/ is left as production for check-demos.
  { script: 'build', pages: ['/', '/oneshots/', '/systems/', '/writing/', '/now/'] },
];

const results = [];
for (const [i, { script, pages }] of phases.entries()) {
  if (!args.includes('--no-build')) build(script);
  // Home is audited with a telemetry reading in place; the document is a
  // test fixture served locally, never part of the build.
  const server = await serve('dist', {
    '/telemetry.json': telemetry,
    [CONTROL]: ['text/html; charset=utf-8', CONTROL_PAGE],
    ...Object.fromEntries(SCHEMES.map((sc) => [`${SCHEME_CONTROL}${sc}/`, ['text/html; charset=utf-8', schemeControl(sc)]])),
  });
  try {
    for (const scheme of SCHEMES) {
      const stopChrome = await startChrome(scheme);
      try {
        if (i === 0) {
          const s = await audit(`${SCHEME_CONTROL}${scheme}/`, 'mobile', scheme);
          if (!s.failing.includes('color-contrast')) problems.push(`control: the ${scheme} run did not emulate the ${scheme} color scheme`);
          if (scheme === SCHEMES[0]) {
            const c = await audit(CONTROL, 'mobile', scheme);
            if (!c.thirdParty.some((u) => u.startsWith('https://example.com/'))) problems.push('control: the third-party detector missed the control page\'s request');
            if (c.a11y >= A11Y_FLOOR) problems.push(`control: the accessibility floor passed a page with known faults (${c.a11y})`);
            console.log(`control: third-party ${c.thirdParty.length ? 'seen' : 'MISSED'}, accessibility ${c.a11y} (${c.failing.join(', ')})`);
          }
          console.log(`control: ${scheme} scheme ${s.failing.includes('color-contrast') ? 'emulated' : 'NOT emulated'}`);
        }
        for (const p of pages) for (const form of ['mobile', 'desktop']) results.push(await audit(p, form, scheme));
      } finally {
        await stopChrome();
      }
    }
  } finally {
    server.close();
  }
}

console.log('\npage                          form     scheme  a11y  perf  html+css+js (gzip)');
for (const r of results) {
  console.log(`${r.pathname.padEnd(30)}${r.form.padEnd(9)}${r.scheme.padEnd(7)}${String(r.a11y).padStart(5)}  ${String(r.perf).padStart(4)}  ${(r.transfer / 1024).toFixed(1).padStart(6)} KB${r.failing.length ? `   failing: ${r.failing.join(', ')}` : ''}`);
  if (r.a11y < A11Y_FLOOR) problems.push(`${r.pathname} (${r.form}, ${r.scheme}): accessibility ${r.a11y} < ${A11Y_FLOOR}`);
  for (const u of r.thirdParty) problems.push(`${r.pathname} (${r.form}, ${r.scheme}): third-party request ${u}`);
}
const home = results.find((r) => r.pathname === '/' && r.form === 'mobile');
if (!home) problems.push('Home was not audited');
else if (home.transfer > HOME_BUDGET) problems.push(`Home transfers ${(home.transfer / 1024).toFixed(1)} KB of HTML, CSS and JS, over ${HOME_BUDGET / 1024} KB`);
console.log(`\nreports: ${OUT}/`);

if (!args.includes('--no-demos')) {
  console.log('\n== demos, 10 seconds each, watching for requests to other hosts');
  const r = spawnSync('node', ['scripts/check-demos.mjs', '--seconds', '10'], { stdio: 'inherit' });
  if (r.status !== 0) problems.push('check-demos failed');
}

if (problems.length) {
  console.error('\nSC-11 FAILED:');
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log('\nSC-11 PASSED');
