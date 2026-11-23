// WHY: One publication filter keeps draft essays out of pages, the feed, and the palette.
import { getCollection } from 'astro:content';
import { arrange } from './essays';

export async function getPublishedEssays() {
  return arrange(await getCollection('writing'));
}
