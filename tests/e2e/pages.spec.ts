import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

const RUNS_DIR = 'tests/fixtures/oneshots/runs';
const MANIFESTS = readdirSync(RUNS_DIR).filter((d) => existsSync(join(RUNS_DIR, d, 'run.toml')));

test.describe('Home', () => {
  test('readouts say "unavailable" until telemetry is published, never a number', async ({ page }) => {
    await page.goto('/');
    const readouts = page.locator('[data-readout]');
    expect(await readouts.count()).toBeGreaterThanOrEqual(6);
    expect(await page.locator('.telemetry .tile').evaluateAll((ts) => ts.map((t) => t.getAttribute('data-readout'))))
      .toEqual(['agent-sessions-30d', 'tokens-30d', 'pull-requests-30d']);
    for (const r of await readouts.all()) {
      await expect(r).toContainText('unavailable');
    }
    for (const v of await page.locator('[data-readout] [data-value]').all()) await expect(v).not.toHaveText(/\d/);
  });

  test('the system diagram, oneshots strip and register come from site data', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.system .lane .part')).toHaveCount(6);
    // The four newest runs, in order; fixture-plain has no hero, so it keeps
    // its place with the placeholder plate.
    const hrefs = await page.locator('.strip a').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
    expect(hrefs).toEqual(['/oneshots/fixture-demo/', '/oneshots/fixture-hostile/', '/oneshots/fixture-film/', '/oneshots/fixture-plain/']);
    await expect(page.locator('.strip a[href="/oneshots/fixture-plain/"] .placeholder')).toHaveText('No figure recorded');
    await expect(page.locator('.register tbody tr')).toHaveCount(1);
    await expect(page.locator('.register')).toContainText('Calibrating a Bench Scale');
  });

  test('control: with motion allowed, the wires on the harness bus pulse', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/');
    const flows = await page.evaluate(() => document.getAnimations().filter((a) => (a as CSSAnimation).animationName === 'flow' && a.playState === 'running').length);
    expect(flows).toBe(2);
  });
});

test.describe('Now', () => {
  test('the Writing cell names the latest published essay, and the history lists every revision', async ({ page }) => {
    await page.goto('/now/');
    await expect(page.locator('.now-grid > div', { hasText: 'Writing' }).locator('a')).toHaveText('Calibrating a Bench Scale');
    await expect(page.locator('.register tbody tr')).toHaveCount(4);
  });
});

test.describe('llms.txt', () => {
  test('follows the format and lists exactly the published essay and every run', async ({ request }) => {
    const res = await request.get('/llms.txt');
    expect(res.status()).toBe(200);
    const body = await res.text();
    expect(body).toMatch(/^# Davis Gee\n\n> \S/);
    for (const h of ['## Writing', '## Oneshots', '## Systems', '## Pages']) expect(body).toContain(`\n${h}\n`);
    const essayLinks = body.match(/\]\(https:\/\/davisbuilds\.net\/writing\/[^)]+\.md\)/g) ?? [];
    expect(essayLinks).toEqual(['](https://davisbuilds.net/writing/published-essay.md)']);
    const runLinks = body.match(/\]\(https:\/\/davisbuilds\.net\/oneshots\/[\w-]+\/\)/g) ?? [];
    expect(runLinks.length).toBe(MANIFESTS.length);
    expect(body).not.toContain('UNPUBLISHED-FIXTURE-MARKER');
    expect(body).not.toContain('Unpublished Fixture');
  });

  test('manifest text is escaped, so a summary cannot add a link or markup', async ({ request }) => {
    const body = await (await request.get('/llms.txt')).text();
    const line = body.split('\n').find((l) => l.includes('/oneshots/fixture-hostile/'))!;
    expect(line).toContain('carries \\[a link\\]\\(https://example.com/phish\\) and \\*emphasis\\*.');
    expect(body).not.toContain('](https://example.com/phish)');
  });

  test('each published essay is served as Markdown, and the unpublished one is not', async ({ request }) => {
    const md = await request.get('/writing/published-essay.md');
    expect(md.status()).toBe(200);
    const text = await md.text();
    expect(text).toMatch(/^# Calibrating a Bench Scale\n/);
    expect(text).toContain('- Published: 2026-02-20');
    expect(text).toContain('- Canonical: https://davisbuilds.net/writing/published-essay/');
    expect(text).toContain('A bench scale reads a load cell, converts the signal, and shows a number.');
    expect((await request.get('/writing/unpublished-essay.md')).status()).toBe(404);
  });
});
