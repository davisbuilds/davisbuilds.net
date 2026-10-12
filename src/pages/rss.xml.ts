import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { getPublishedEssays } from '../lib/writing';

export async function GET(context: APIContext) {
  const essays = await getPublishedEssays();
  return rss({
    title: 'Davis Gee · Writing',
    description: 'Essays by Davis Gee on building with agents, measurement, and engineering practice.',
    site: context.site!,
    items: essays.map((e) => ({
      title: e.entry.data.title,
      description: e.entry.data.description,
      pubDate: e.published,
      link: e.href,
      categories: e.entry.data.tags,
    })),
  });
}
