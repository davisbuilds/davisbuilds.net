import { describe, expect, it } from 'vitest';
import { countMergedPullRequests, type MergedPullRequestPage } from '../../src/lib/telemetry-github';

const t = (s: string) => Date.parse(s);
const FROM = t('2026-10-07T00:00:00Z');
const TO = t('2026-11-06T00:00:00Z');

// Pages as GitHub returns them: merged PRs, most recently updated first.
const node = (id: string, mergedAt: string | null, updatedAt = mergedAt ?? '2026-11-01T00:00:00Z') => ({ id, mergedAt, updatedAt });
const page = (nodes: MergedPullRequestPage['nodes'], endCursor: string | null): MergedPullRequestPage => ({
  nodes,
  pageInfo: { hasNextPage: endCursor !== null, endCursor },
});
const pages = (...list: MergedPullRequestPage[]) => {
  const requested: Array<string | null> = [];
  const fetchPage = async (cursor: string | null) => {
    requested.push(cursor);
    const next = list.shift();
    if (!next) throw new Error('fetched past the last page');
    return next;
  };
  return { fetchPage, requested };
};

describe('merged pull requests in the window', () => {
  it('counts only merges inside the window, across pages', async () => {
    const { fetchPage } = pages(
      page([node('a', '2026-11-05T10:00:00Z'), node('b', '2026-11-06T00:00:01Z', '2026-11-05T09:00:00Z')], 'c1'),
      page([node('c', '2026-10-20T00:00:00Z'), node('d', '2026-10-06T23:59:59Z', '2026-10-15T00:00:00Z')], null),
    );
    expect(await countMergedPullRequests(fetchPage, FROM, TO)).toBe(2);
  });

  it('stops once a whole page was last updated before the window', async () => {
    // A PR is updated when it merges, so nothing later in the order can have merged inside the window.
    const { fetchPage, requested } = pages(
      page([node('a', '2026-11-01T00:00:00Z')], 'c1'),
      page([node('b', '2026-09-01T00:00:00Z', '2026-10-06T00:00:00Z')], 'c2'),
    );
    expect(await countMergedPullRequests(fetchPage, FROM, TO)).toBe(1);
    expect(requested).toEqual([null, 'c1']);
  });

  it('refuses a pull request it has already counted', async () => {
    const { fetchPage } = pages(page([node('a', '2026-11-01T00:00:00Z')], 'c1'), page([node('a', '2026-11-01T00:00:00Z')], null));
    await expect(countMergedPullRequests(fetchPage, FROM, TO)).rejects.toThrow(/twice/);
  });

  it('refuses a cursor it has already followed', async () => {
    const { fetchPage } = pages(page([node('a', '2026-11-02T00:00:00Z')], 'c1'), page([node('b', '2026-11-01T00:00:00Z')], 'c1'));
    await expect(countMergedPullRequests(fetchPage, FROM, TO)).rejects.toThrow(/cursor/);
  });

  it('refuses pages that are not newest-updated first', async () => {
    const { fetchPage } = pages(page([node('a', '2026-10-10T00:00:00Z'), node('b', '2026-11-01T00:00:00Z')], null));
    await expect(countMergedPullRequests(fetchPage, FROM, TO)).rejects.toThrow(/order/);
  });

  it('refuses a merged pull request without a merge time', async () => {
    const { fetchPage } = pages(page([node('a', null, '2026-11-01T00:00:00Z')], null));
    await expect(countMergedPullRequests(fetchPage, FROM, TO)).rejects.toThrow(/merge time/);
  });

  it('refuses to page without end', async () => {
    const endless = async (cursor: string | null) => page([node(`pr-${cursor}`, '2026-11-01T00:00:00Z')], `${cursor ?? 0}x`);
    await expect(countMergedPullRequests(endless, FROM, TO, 3)).rejects.toThrow(/pages/);
  });
});
