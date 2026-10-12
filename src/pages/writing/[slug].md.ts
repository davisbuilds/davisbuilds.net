// Each published essay's Markdown, for readers and agents that prefer plain
// text. Same published-only source as the essay pages.
import type { APIContext } from 'astro';
import { getPublishedEssays } from '../../lib/writing';
import { isoDate } from '../../lib/essays';

export async function getStaticPaths() {
  return (await getPublishedEssays()).map((essay) => ({ params: { slug: essay.entry.id }, props: { essay } }));
}

type Essay = Awaited<ReturnType<typeof getPublishedEssays>>[number];

export function GET({ props, site }: APIContext<{ essay: Essay }>) {
  const { entry, href } = props.essay;
  const d = entry.data;
  const canonical = d.canonical ?? new URL(href, site).href;
  const header = [
    `# ${d.title}`,
    '',
    `> ${d.description}`,
    '',
    `- Created: ${isoDate(d.created)}`,
    `- Published: ${isoDate(props.essay.published)}`,
    `- Updated: ${isoDate(d.updated)}`,
    `- Status: ${d.status} · Confidence: ${d.confidence} · Importance: ${d.importance} / 10`,
    `- Written: ${d.written_by}`,
    `- Canonical: ${canonical}`,
  ].join('\n');
  return new Response(`${header}\n\n---\n\n${(entry.body ?? '').trim()}\n`, {
    headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
  });
}
