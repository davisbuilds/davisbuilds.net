// The one place pages, the RSS feed and the palette get essays from. It
// returns published essays only.
import { getCollection } from 'astro:content';
import { arrange } from './essays';

export async function getPublishedEssays() {
  return arrange(await getCollection('writing'));
}
