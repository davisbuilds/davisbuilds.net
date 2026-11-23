// WHY: Keep ordering independent of the Astro collection so unit tests can use plain entries.

type EntryLike = { id: string; body?: string; data: { created: Date; published?: Date | null } };

export type Arranged<T extends EntryLike> = {
  entry: T;
  published: Date;
  doc: string;
  href: string;
  words: number;
  minutes: number;
};

export function countWords(markdown: string): number {
  const text = markdown
    .replace(/<[^>]+>/g, ' ')
    .replace(/\]\([^)]*\)/g, ']')
    .replace(/\[\^[^\]]+\]:?/g, ' ');
  return text.split(/\s+/).filter((t) => /[\p{L}\p{N}]/u.test(t)).length;
}

export const readingMinutes = (words: number): number => Math.max(1, Math.round(words / 200));

// WHY: Assign document numbers in publication order so publishing an older draft preserves existing numbers.
export function arrange<T extends EntryLike>(entries: T[]): Arranged<T>[] {
  const published = entries
    .flatMap((entry) => (entry.data.published instanceof Date ? [{ entry, published: entry.data.published }] : []))
    .sort((a, b) => a.published.getTime() - b.published.getTime() || a.entry.data.created.getTime() - b.entry.data.created.getTime() || a.entry.id.localeCompare(b.entry.id));
  return published
    .map(({ entry, published }, i) => {
      const words = countWords(entry.body ?? '');
      return { entry, published, doc: `W-${String(i + 1).padStart(2, '0')}`, href: `/writing/${entry.id}/`, words, minutes: readingMinutes(words) };
    })
    .reverse();
}

export const isoDate = (d: Date): string => d.toISOString().slice(0, 10);

export const statusSlug = (s: string): string => s.replace(/\s+/g, '-');
