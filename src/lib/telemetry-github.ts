// Counts the operator's merged pull requests for the telemetry snapshot: every
// pull request they authored, in any repository their `gh` login can read,
// whose merge time falls in the window. GitHub's contribution totals itemize
// public repositories only, and search can return incomplete results, so this
// pages the viewer's merged pull requests instead and refuses anything that
// would make the count partial.

export type MergedPullRequestPage = {
  nodes: Array<{ id: string; mergedAt: string | null; updatedAt: string }>;
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
};

// Pages must come most recently updated first. Merging updates a pull request,
// so once a whole page was last updated before the window, nothing after it
// can have merged inside the window.
export async function countMergedPullRequests(
  fetchPage: (cursor: string | null) => Promise<MergedPullRequestPage>,
  from: number,
  to: number,
  maxPages = 100,
): Promise<number> {
  const seen = new Set<string>();
  const cursors = new Set<string>();
  let cursor: string | null = null;
  let lastUpdated = Infinity;
  let count = 0;
  for (let pages = 0; ; pages++) {
    if (pages === maxPages) throw new Error(`merged pull requests: more than ${maxPages} pages`);
    const { nodes, pageInfo } = await fetchPage(cursor);
    for (const pr of nodes) {
      if (seen.has(pr.id)) throw new Error(`merged pull requests: ${pr.id} appeared twice`);
      seen.add(pr.id);
      const updated = Date.parse(pr.updatedAt);
      if (!(updated <= lastUpdated)) throw new Error('merged pull requests: pages are not in most-recently-updated order');
      lastUpdated = updated;
      if (!pr.mergedAt) throw new Error(`merged pull requests: ${pr.id} has no merge time`);
      const merged = Date.parse(pr.mergedAt);
      if (merged >= from && merged <= to) count++;
    }
    if (!pageInfo.hasNextPage || lastUpdated < from) return count;
    if (!pageInfo.endCursor || cursors.has(pageInfo.endCursor)) throw new Error('merged pull requests: the next-page cursor is missing or repeated');
    cursors.add(pageInfo.endCursor);
    cursor = pageInfo.endCursor;
  }
}
