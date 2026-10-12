import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { PARTS } from '../../src/data/parts';

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

  test('Habits AI is named without a link, and every other app links to its public repository', async ({ page }) => {
    await page.goto('/systems/');
    await expect(page.locator('.apps div.part', { hasText: 'Habits AI' })).toHaveCount(1);
    await expect(page.locator('.apps a.part', { hasText: 'Habits AI' })).toHaveCount(0);
    for (const a of await page.locator('.apps a.part').all()) expect(await a.getAttribute('href')).toMatch(/^https:\/\/github\.com\/davisbuilds\/[\w-]+$/);
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
