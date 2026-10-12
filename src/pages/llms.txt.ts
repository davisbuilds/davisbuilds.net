// /llms.txt in the llmstxt.org format. Built from the same
// sources as the pages: published essays, the synced oneshots runs and the
// parts list, so it can't list anything a page doesn't show.
import type { APIContext } from 'astro';
import { getPublishedEssays } from '../lib/writing';
import { loadOneshots } from '../lib/oneshots/data';
import { APPS, PARTS, repoUrl } from '../data/parts';

// Text from essays and run manifests (contributed, untrusted) goes into
// Markdown, so its syntax characters are escaped: a summary can't add a link
// or break the list item around it.
const text = (s: string) => s.replace(/\s+/g, ' ').trim().replace(/[\\`*_{}[\]()<>#+!|~]/g, '\\$&');

export async function GET({ site }: APIContext) {
  const url = (p: string) => new URL(p, site).href;
  const essays = await getPublishedEssays();
  const { runs } = loadOneshots();
  const byDate = [...runs].sort((a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug));
  const lines = [
    '# Davis Gee',
    '',
    '> Davis Gee is a systems engineer who builds AI infrastructure and context-engineering tools for coding agents, and writes about working with them. This site holds his essays, a test log of agent "oneshot" runs with playable demos, and the parts list of the tools he maintains.',
    '',
    'Essays are available as Markdown. Each run page records the model, the human turns and the wall-clock time.',
    '',
    '## Writing',
    '',
    ...(essays.length
      ? essays.map((e) => `- [${text(e.entry.data.title)}](${url(`/writing/${e.entry.id}.md`)}): ${text(e.entry.data.description)}`)
      : ['- No essays are published yet.']),
    '',
    '## Oneshots',
    '',
    ...byDate.map((r) => `- [${text(r.title)}](${url(`/oneshots/${r.slug}/`)}): ${text(r.summary)}`),
    '',
    '## Systems',
    '',
    `- [Systems](${url('/systems/')}): drawings of the main parts, the parts list with GitHub dates, and the applications built on them`,
    ...PARTS.map((p) => `- [${text(p.repo)}](${repoUrl(p.repo)}): ${text(p.function)}`),
    ...APPS.map((a) => (a.repo ? `- [${text(a.name)}](${repoUrl(a.repo)}): ${text(a.description)}` : `- ${text(a.name)} (${text(a.kind)}): ${text(a.description)}`)),
    '',
    '## Pages',
    '',
    `- [Home](${url('/')}): who Davis is, live readouts with their sources, and the newest runs and essays`,
    `- [Writing](${url('/writing/')}): the essay register, with each essay's status and confidence`,
    `- [Oneshots](${url('/oneshots/')}): every run, its headline numbers and the autonomy plot`,
    `- [Now](${url('/now/')}): what Davis is focused on currently`,
    `- [RSS feed](${url('/rss.xml')}): published essays`,
    '',
  ];
  return new Response(lines.join('\n'), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
