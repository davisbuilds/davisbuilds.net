// Plays every runnable demo in the built site, inside its sandbox, and reports
// what each one did: requests to other hosts, CSP
// violations, script errors, and whether the frame drew anything (by its
// pixels, not its DOM: an empty canvas still counts as nothing drawn).
//
// Canvases are read from inside the frame. On CI's software WebGL a busy demo
// can starve the compositor so a screenshot never completes, while reading a
// canvas needs no new frame. A setup script makes WebGL keep its last frame
// readable. A frame without enough drawn canvas pixels (a DOM or SVG demo, or
// a blank one) is judged by a screenshot instead.
//
//   pnpm build && node scripts/check-demos.mjs [--shots <dir>] [--seconds 6]
//
// Exits non-zero if any demo requests another host, hits its CSP, throws or
// logs an error, or draws nothing: a demo that doesn't work in its sandbox must
// not be published as runnable.
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { drawnPixels, MIN_DRAWN_PIXELS } from '../src/lib/oneshots/pixels.ts';

const args = process.argv.slice(2);
const opt = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const shots = opt('--shots', null);
const seconds = Number(opt('--seconds', '6'));
// --origin plays the demos from a running server (the rehearsal's nginx, with
// its sandbox header) instead of a local preview.
const external = opt('--origin', null);
const port = 4393;
const origin = external ?? `http://localhost:${port}`;

const { runs } = JSON.parse(readFileSync('src/generated/oneshots/runs.json', 'utf8'));
const demos = runs.filter((r) => r.demo);

const server = external ? null : spawn('pnpm', ['exec', 'astro', 'preview', '--port', String(port), '--ignore-lock'], { stdio: 'ignore' });
for (let i = 0; ; i++) {
  try {
    if ((await fetch(origin)).ok) break;
  } catch {}
  if (i > 60) throw new Error('preview server did not start');
  await new Promise((r) => setTimeout(r, 500));
}

// Software WebGL, so WebGL2 demos render in headless Chromium without a GPU.
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
if (shots) mkdirSync(shots, { recursive: true });
let failed = false;
try {
  for (const run of demos) {
    // A modest viewport: demos size their canvases to the window, and software
    // WebGL on a 2-core CI runner slows with every pixel.
    const context = await browser.newContext({ viewport: { width: 960, height: 600 } });
    await context.addInitScript(() => {
      const getContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type, attrs) {
        const webgl = /^(webgl2?|experimental-webgl)$/.test(type);
        return getContext.call(this, type, webgl ? { ...attrs, preserveDrawingBuffer: true } : attrs);
      };
    });
    const page = await context.newPage();
    const offsite = new Set();
    const errors = [];
    const csp = [];
    page.on('request', (req) => {
      const u = new URL(req.url());
      if (!['http:', 'https:'].includes(u.protocol) || u.origin === origin) return;
      offsite.add(u.host);
    });
    page.on('console', (msg) => {
      const text = msg.text();
      if (/Content.Security.Policy/i.test(text)) csp.push(text.slice(0, 160));
      else if (msg.type() === 'error') errors.push(text.slice(0, 160));
    });
    page.on('pageerror', (err) => errors.push(String(err).slice(0, 160)));
    let frame;
    let drawn = 0;
    let via = 'canvas';
    try {
      await page.goto(`${origin}/oneshots/${run.slug}/play/`);
      await page.waitForTimeout(seconds * 1000);
      frame = page.frames().find((f) => f.url().includes(`/oneshots/${run.slug}/files/`));
      if (frame) {
        // Only what a visitor can see counts. A canvas is read if
        // checkVisibility passes (display, visibility, opacity, ancestors
        // included) and nothing from it up to the root sets a filter, clip
        // path, mask or blend, which hit-testing can't see. Its box is split
        // into an 8x8 grid, and a cell counts only where the canvas is on top
        // at the cell's center and at its four corners (inset 1px), so a cell
        // that is partly covered drops out whole. Hit-testing leaves out what
        // is covered, clipped by an ancestor or off-screen.
        const GRID = 8;
        const canvases = await frame.evaluate((grid) =>
          [...document.querySelectorAll('canvas')].flatMap((c) => {
            if (c.width * c.height === 0) return [];
            if (!c.checkVisibility({ opacityProperty: true, visibilityProperty: true, contentVisibilityAuto: true })) return [];
            for (let el = c; el; el = el.parentElement) {
              const cs = getComputedStyle(el);
              if (cs.filter !== 'none' || cs.clipPath !== 'none' || cs.maskImage !== 'none' || cs.mixBlendMode !== 'normal') return [];
            }
            const r = c.getBoundingClientRect();
            const cells = [];
            const [cw, ch] = [r.width / grid, r.height / grid];
            const onTop = (x, y) => document.elementFromPoint(x, y) === c;
            for (let i = 0; i < grid; i++) for (let j = 0; j < grid; j++) {
              const [x0, y0, x1, y1] = [r.left + i * cw + 1, r.top + j * ch + 1, r.left + (i + 1) * cw - 1, r.top + (j + 1) * ch - 1];
              if (onTop((x0 + x1) / 2, (y0 + y1) / 2) && onTop(x0, y0) && onTop(x1, y0) && onTop(x0, y1) && onTop(x1, y1)) cells.push([i, j]);
            }
            return cells.length ? [{ url: c.toDataURL('image/png'), cells }] : [];
          }), GRID);
        for (const { url, cells } of canvases) drawn += await drawnPixels(Buffer.from(url.slice(url.indexOf(',') + 1), 'base64'), { size: GRID, cells });
      }
      // A page screenshot clipped to the frame. An element screenshot waits for
      // the frame to hold still across animation frames, which a busy demo may
      // never do.
      const clip = await page.locator('iframe').first().boundingBox();
      if (frame && clip && drawn < MIN_DRAWN_PIXELS) {
        via = 'screenshot';
        // A demo behind an overlay can keep software WebGL busy enough that a
        // capture times out. Try three times, stopping the demo's animation
        // loop after a timeout so the compositor can catch up.
        for (let attempt = 1; ; attempt++) {
          try {
            drawn = await drawnPixels(await page.screenshot({ clip, timeout: 30_000 }));
            break;
          } catch (err) {
            if (attempt === 3) throw err;
            await frame.evaluate(() => {
              window.requestAnimationFrame = () => 0;
            });
            await page.waitForTimeout(1000);
          }
        }
      }
      if (shots) await page.screenshot({ path: path.join(shots, `${run.slug}.png`), timeout: 60_000 });
    } catch (err) {
      errors.push(`check failed: ${String(err).split('\n')[0].slice(0, 160)}`);
    }
    const drew = drawn >= MIN_DRAWN_PIXELS;
    const ok = Boolean(frame) && offsite.size === 0 && csp.length === 0 && errors.length === 0 && drew;
    failed ||= !ok;
    console.log(`${ok ? 'OK  ' : 'FAIL'} ${run.slug.padEnd(20)} frame=${Boolean(frame)} offsite=${[...offsite].join(',') || 0} csp=${csp.length} errors=${errors.length} drawn=${drawn}px via ${via}`);
    for (const e of [...csp, ...errors].slice(0, 4)) console.log(`       ${e}`);
    await context.close();
  }
} finally {
  await browser.close();
  server?.kill();
}
process.exit(failed ? 1 : 0);
