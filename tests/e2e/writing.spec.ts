import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

const ESSAY = '/writing/published-essay/';
const MARKER = 'UNPUBLISHED-FIXTURE-MARKER';

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? files(join(dir, f)) : [join(dir, f)]));

test.describe('essay page', () => {
  test('shows the metadata block', async ({ page }) => {
    await page.goto(ESSAY);
    const meta = page.locator('dl.meta');
    for (const [dt, dd] of [
      ['Created', '2026-01-12'], ['Published', '2026-02-20'], ['Updated', '2026-03-04'], ['Status', 'draft'], ['Confidence', 'likely'],
      ['Importance', '6 / 10'], ['Length', /^[\d,]+ words · \d+ min$/], ['Written', 'by hand; this is test fixture text'],
      ['Also on', 'example.com'],
    ] as const) {
      await expect(meta.locator('div', { has: page.locator('dt', { hasText: dt }) }).locator('dd')).toHaveText(dd);
    }
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://davisbuilds.net/writing/published-essay/');
  });

  test('margin notes sit beside their paragraph on wide screens and light up from their marker', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(ESSAY);
    const ref = page.locator('a.ref[href="#sn-drift"]');
    const note = page.locator('aside#sn-drift');
    await expect(note).toContainText('Two scales that agree');
    await expect(page.locator('section[data-footnotes]')).toHaveCount(0);
    const para = page.locator('#prose > p', { has: ref });
    const [p, n] = [await para.boundingBox(), await note.boundingBox()];
    expect(n!.x).toBeGreaterThan(p!.x + p!.width);
    expect(Math.abs(n!.y - p!.y)).toBeLessThan(p!.height);
    await ref.hover();
    await expect(note).toHaveClass(/\blit\b/);
  });

  test('below the breakpoint, margin notes become inline after their paragraph', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(ESSAY);
    const para = page.locator('#prose > p', { has: page.locator('a.ref[href="#sn-drift"]') });
    const [p, n] = [await para.boundingBox(), await page.locator('aside#sn-drift').boundingBox()];
    expect(n!.y).toBeGreaterThanOrEqual(p!.y + p!.height);
    expect(Math.abs(n!.x - p!.x)).toBeLessThan(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
  });

  test('the reading ruler tracks scroll through the essay body', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(ESSAY);
    const ruler = page.locator('#ruler');
    await expect(ruler).toBeVisible();
    await expect(ruler).toHaveAttribute('data-progress', '0.000');
    await page.evaluate(() => {
      const r = document.getElementById('prose')!.getBoundingClientRect();
      scrollTo(0, scrollY + r.top + r.height / 2 - innerHeight / 2);
    });
    await expect.poll(async () => Number(await ruler.getAttribute('data-progress'))).toBeGreaterThanOrEqual(0.4);
    await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
    await expect(ruler).toHaveAttribute('data-progress', '1.000');
    await expect(page.locator('#ruler-pos')).toHaveText(/^([\d,]+) \/ \1 words$/);
  });

  test('the palette lists the published essay', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('/');
    await page.locator('#pal-q').fill('bench');
    await expect(page.locator('#pal-list')).toContainText('Calibrating a Bench Scale');
  });
});

test.describe('writing register', () => {
  test('status filters show matching essays and an empty state', async ({ page }) => {
    await page.goto('/writing/');
    const rows = page.locator('#reg-all tr');
    await expect(rows).toHaveCount(1);
    await page.getByRole('button', { name: 'notes', exact: true }).click();
    await expect(rows.first()).toBeHidden();
    await expect(page.locator('#reg-empty')).toBeVisible();
    await page.getByRole('button', { name: 'draft', exact: true }).click();
    await expect(rows.first()).toBeVisible();
    await expect(page.locator('#reg-empty')).toBeHidden();
    await expect(page.getByRole('button', { name: 'draft', exact: true })).toHaveAttribute('aria-pressed', 'true');
  });

  test('has no horizontal page scroll at 390 px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/writing/');
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
  });
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });
  test('the register lists every essay and the essay is complete', async ({ page }) => {
    await page.goto('/writing/');
    await expect(page.locator('[data-filters]')).toBeHidden();
    await expect(page.locator('#reg-all tr')).toHaveCount(1);
    await expect(page.locator('#reg-all tr').first()).toBeVisible();
    await expect(page.locator('#reg-all tr').first().locator('td.m').last()).toHaveText('2026-02-20');
    await page.goto(ESSAY);
    await expect(page.locator('#prose')).toContainText('That is the end of the fixture essay.');
    await expect(page.locator('aside#sn-hysteresis')).toBeVisible();
    await expect(page.locator('#ruler')).toBeHidden();
  });
});

test.describe('feeds and unpublished essays (asserted on dist/)', () => {
  const dist = join(process.cwd(), 'dist');

  test('control: the marker is in the unpublished fixture, so its absence below means something', () => {
    expect(readFileSync('tests/fixtures/writing/unpublished-essay.md', 'utf8')).toContain(MARKER);
  });

  test('the unpublished essay produces no page, feed item, or sitemap URL', () => {
    const all = files(dist);
    expect(all.some((f) => f.includes('unpublished-essay'))).toBe(false);
    const hits = all.filter((f) => /\.(html|xml|txt|json|js|md)$/.test(f) && readFileSync(f, 'utf8').includes(MARKER));
    expect(hits).toEqual([]);
    expect(readFileSync(join(dist, 'sitemap-0.xml'), 'utf8')).not.toContain('unpublished');
  });

  test('the RSS feed has exactly the published essay', () => {
    const rss = readFileSync(join(dist, 'rss.xml'), 'utf8');
    expect(rss.match(/<item>/g)).toHaveLength(1);
    expect(rss).toContain('<link>https://davisbuilds.net/writing/published-essay/</link>');
    expect(rss).not.toContain('Unpublished Fixture');
    // Dated by publication, not creation (2026-01-12).
    expect(rss).toContain('<pubDate>Fri, 20 Feb 2026 00:00:00 GMT</pubDate>');
  });

  test('the sitemap lists the essay and robots.txt points at the sitemap', () => {
    expect(readFileSync(join(dist, 'sitemap-0.xml'), 'utf8')).toContain('https://davisbuilds.net/writing/published-essay/');
    expect(readFileSync(join(dist, 'robots.txt'), 'utf8')).toContain('Sitemap: https://davisbuilds.net/sitemap-index.xml');
  });

  test('every page advertises the feed', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('link[rel="alternate"][type="application/rss+xml"]')).toHaveAttribute('href', '/rss.xml');
  });
});

test.describe('subscribe line', () => {
  for (const [where, path, after] of [['the end of an essay', ESSAY, '#prose'], ['Writing, after the metadata', '/writing/', '.legend-grid']] as const) {
    test(`sits at ${where} and links Substack's signup page and the feed`, async ({ page }) => {
      await page.goto(path);
      const line = page.locator('aside.subscribe');
      await expect(line).toHaveCount(1);
      await expect(line.locator('a', { hasText: 'Subscribe on Substack' })).toHaveAttribute('href', 'https://davisbuilds.substack.com/subscribe');
      await expect(line.locator('a', { hasText: 'Subscribe on Substack' })).toHaveAttribute('target', '_blank');
      await expect(line.locator('a', { hasText: 'RSS' })).toHaveAttribute('href', '/rss.xml');
      const below = await page.evaluate((sel) => {
        const a = document.querySelector(sel)!.getBoundingClientRect();
        const b = document.querySelector('aside.subscribe')!.getBoundingClientRect();
        return b.top >= a.bottom;
      }, after);
      expect(below).toBe(true);
    });
  }
});
