import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { APPS, PARTS } from '../../src/data/parts';

const fixture = JSON.parse(readFileSync('tests/fixtures/github/repos.json', 'utf8')) as {
  read_at: string;
  repos: { name: string; private: boolean; created_at: string; pushed_at: string }[];
};
const repo = (name: string) => fixture.repos.find((r) => r.name === name)!;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}

test.describe('Systems', () => {
  test('every part row carries its created and last-push dates from the GitHub read', async ({ page }) => {
    await page.goto('/systems/');
    const rows = page.locator('table.spec tbody tr');
    expect(await rows.count()).toBe(PARTS.length);
    for (const row of await rows.all()) {
      const name = (await row.getAttribute('data-part'))!;
      await expect(row.locator('td').nth(4)).toHaveText(repo(name).created_at.slice(0, 10));
      await expect(row.locator('[data-last-signal]')).toHaveText(repo(name).pushed_at.slice(0, 10));
    }
    await expect(page.locator('.sec-head', { has: page.getByRole('heading', { name: 'Parts', exact: true }) })).toContainText(`GitHub read ${fixture.read_at.slice(0, 10)}`);
  });

  test('freshness bars drain one per week without a push', async ({ page }) => {
    await page.goto('/systems/');
    // Read 2026-10-01; dojo pushed 2026-09-30 (0 weeks), envdiff 2026-08-20 (6 weeks).
    await expect(page.locator('tr[data-part="dojo"] .age i.on')).toHaveCount(8);
    await expect(page.locator('tr[data-part="envdiff"] .age i.on')).toHaveCount(2);
  });

  test('applications offer live destinations and only curated public source links', async ({ page }) => {
    await page.goto('/systems/');
    const apps = page.locator('#applications .part');
    await expect(apps).toHaveCount(APPS.length);
    const influence = apps.filter({ has: page.getByRole('heading', { name: 'Influence Index', exact: true }) });
    await expect(influence.getByRole('link', { name: 'Visit site' })).toHaveAttribute('href', 'https://influence-index-eta.vercel.app');
    await expect(influence.getByRole('link', { name: 'Source' })).toHaveAttribute('href', 'https://github.com/davisbuilds/influence-index');
    const postcards = apps.filter({ has: page.getByRole('heading', { name: 'Postcards', exact: true }) });
    await expect(postcards.getByRole('link', { name: 'Visit site' })).toHaveAttribute('href', 'https://davis-postcards.vercel.app');
    await expect(postcards.getByRole('link')).toHaveCount(1);
    await expect(apps.filter({ hasText: 'Habits AI' }).getByRole('link')).toHaveCount(0);
    await expect(apps.filter({ has: page.getByRole('heading', { name: 'podsave', exact: true }) }).getByRole('link', { name: 'Source' })).toHaveAttribute('href', 'https://github.com/davisbuilds/podsave');
  });

  test('Home features two live apps between Systems and Oneshots, and llms.txt uses the live URLs', async ({ page, request }) => {
    await page.goto('/');
    const headings = await page.locator('main h2').allTextContents();
    expect(headings.indexOf('Apps & experiments')).toBe(headings.indexOf('Systems') + 1);
    expect(headings.indexOf('Oneshots')).toBe(headings.indexOf('Apps & experiments') + 1);
    const section = page.locator('section', { has: page.getByRole('heading', { name: 'Apps & experiments' }) });
    await expect(section.locator('.part')).toHaveCount(2);
    await expect(section.getByRole('heading', { name: 'Influence Index', exact: true })).toBeVisible();
    await expect(section.getByRole('heading', { name: 'Postcards', exact: true })).toBeVisible();
    await expect(section.getByRole('link', { name: 'All applications' })).toHaveAttribute('href', '/systems/#applications');
    for (const link of await section.getByRole('link', { name: 'Visit site' }).all()) {
      await expect(link).toHaveAttribute('target', '_blank');
      await expect(link).toHaveAttribute('rel', 'noopener');
    }
    const body = await (await request.get('/llms.txt')).text();
    expect(body).toContain('[Influence Index](https://influence-index-eta.vercel.app)');
    expect(body).toContain('[Postcards](https://davis-postcards.vercel.app)');
    expect(body).toContain('Postcards from the places that stayed with me.');
    expect(body).toContain('[Source](https://github.com/davisbuilds/influence-index)');
  });

  test('hovering a plate runs its flows', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/systems/');
    const running = () => page.evaluate(() => document.querySelectorAll('.plate .flow').length && document.getAnimations().filter((a) => a.playState === 'running' && (a as CSSAnimation).animationName === 'dash').length);
    expect(await running()).toBe(0);
    await page.locator('.plate').first().hover();
    await expect.poll(running).toBeGreaterThan(0);
  });
});

// The real private-name check runs at deploy time against the production
// build (scripts/lib/private-names.mjs), since the names can't be listed here.
// This one holds the fixture build to the same rule for the fixture's
// private repository.
test.describe('the fixture private repository never reaches the build', () => {
  const text = files('dist')
    .filter((f) => /\.(html|xml|txt|json|js|css|md)$/.test(f))
    .map((f) => [f, readFileSync(f, 'utf8').toLowerCase()] as const);

  test('control: the scan sees public part names and the Habits AI display name', () => {
    expect(text.length).toBeGreaterThan(10);
    expect(text.some(([, t]) => t.includes('fetchmd'))).toBe(true);
    expect(text.some(([, t]) => t.includes('habits ai'))).toBe(true);
  });
  test('no "fixture-private-repo" anywhere in dist/', () => {
    expect(text.filter(([, t]) => t.includes('fixture-private-repo')).map(([f]) => f)).toEqual([]);
  });
});
