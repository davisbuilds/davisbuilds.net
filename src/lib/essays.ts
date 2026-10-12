// Pure helpers for the Writing section. src/lib/writing.ts applies them to the
// content collection; keeping them here lets unit tests run without Astro.

type EntryLike = { id: string; body?: string; data: { created: Date; published?: Date | null } };

export type Arranged<T extends EntryLike> = {
  entry: T;
  published: Date;
  doc: string;
  href: string;
  words: number;
  minutes: number;
};

// Counts words in Markdown source: link targets, footnote markers, HTML tags
// and punctuation-only tokens don't count.
export function countWords(markdown: string): number {
  const text = markdown
    .replace(/<[^>]+>/g, ' ')
    .replace(/\]\([^)]*\)/g, ']')
    .replace(/\[\^[^\]]+\]:?/g, ' ');
  return text.split(/\s+/).filter((t) => /[\p{L}\p{N}]/u.test(t)).length;
}

export const readingMinutes = (words: number): number => Math.max(1, Math.round(words / 200));

// Published essays only, newest first. Document numbers (W-01, W-02, ...)
// follow publication order, so an old draft published later takes the next
// number instead of renumbering what's out, and nothing about unpublished
// drafts, not even their count, shows in the numbering. `published` is a
// date, so essays published the same day order by creation, then slug.
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
