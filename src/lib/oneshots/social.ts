// WHY: Use the attention crop because centered crops cut titles and the tops of tall subjects.
import { getImage } from 'astro:assets';
import { runImage } from './data.ts';
import type { SyncedRun } from './types.ts';

export type SocialImage = { url: string; width: number; height: number; alt: string };

export const SOCIAL_WIDTH = 1200;
export const SOCIAL_HEIGHT = 630;

export async function runSocialImage(run: SyncedRun, site: URL | undefined): Promise<SocialImage | null> {
  const hero = runImage(run, run.hero);
  if (!hero) return null;
  const img = await getImage({ src: hero, width: SOCIAL_WIDTH, height: SOCIAL_HEIGHT, fit: 'cover', position: 'attention', format: 'jpg', quality: 82 });
  return {
    url: new URL(img.src, site).href,
    width: SOCIAL_WIDTH,
    height: SOCIAL_HEIGHT,
    alt: `${run.title}: ${run.summary}`,
  };
}
