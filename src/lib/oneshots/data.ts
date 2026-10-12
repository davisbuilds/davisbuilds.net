// Page-side access to the synced oneshots data. Run `node scripts/sync-oneshots.mjs`
// first; `pnpm dev` and `pnpm build` do that for you.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { ImageMetadata } from 'astro';
import type { SyncedData, SyncedRun } from './types.ts';

const RUNS_JSON = path.join(process.cwd(), 'src/generated/oneshots/runs.json');

export function loadOneshots(): SyncedData {
  if (!existsSync(RUNS_JSON)) throw new Error('oneshots data is missing: run `node scripts/sync-oneshots.mjs` first');
  return JSON.parse(readFileSync(RUNS_JSON, 'utf8')) as SyncedData;
}

const images = import.meta.glob<{ default: ImageMetadata }>('/src/generated/oneshots/*/*.{webp,png,jpg,jpeg,gif}', { eager: true });

export function runImage(run: SyncedRun, file: string | null): ImageMetadata | null {
  if (!file) return null;
  return images[`/src/generated/oneshots/${run.slug}/${file}`]?.default ?? null;
}
