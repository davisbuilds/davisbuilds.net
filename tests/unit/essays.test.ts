import { describe, expect, it } from 'vitest';
import { arrange, countWords, readingMinutes } from '../../src/lib/essays';

const entry = (id: string, created: string, published: string | null, body = 'one two three') => ({
  id, body, data: { created: new Date(created), published: published === null ? null : new Date(published) },
});

describe('countWords', () => {
  it('counts prose words and skips link targets, footnote markers, tags and bare punctuation', () => {
    expect(countWords('A [linked phrase](https://example.com/a-long-url) here[^n1] — <em>done</em>.\n\n[^n1]: Note text.')).toBe(7);
  });
  it('returns 0 for empty input', () => {
    expect(countWords('')).toBe(0);
  });
});

describe('readingMinutes', () => {
  it('rounds at 200 words a minute, with a floor of one minute', () => {
    expect(readingMinutes(0)).toBe(1);
    expect(readingMinutes(990)).toBe(5);
    expect(readingMinutes(1061)).toBe(5);
  });
});

describe('arrange', () => {
  it('keeps published essays only, newest first, numbered by publication order', () => {
    const out = arrange([
      entry('b', '2026-03-01', '2026-03-02'),
      entry('draft', '2026-01-15', null),
      entry('a', '2026-01-01', '2026-01-03'),
      entry('c', '2026-05-01', '2026-05-01'),
    ]);
    expect(out.map((e) => [e.entry.id, e.doc, e.href, e.published.toISOString().slice(0, 10)])).toEqual([
      ['c', 'W-03', '/writing/c/', '2026-05-01'],
      ['b', 'W-02', '/writing/b/', '2026-03-02'],
      ['a', 'W-01', '/writing/a/', '2026-01-03'],
    ]);
  });
  it('gives an older draft published later the next number, so earlier essays keep theirs', () => {
    const out = arrange([entry('old-draft', '2026-01-01', '2026-06-01'), entry('first', '2026-02-01', '2026-02-02')]);
    expect(out.map((e) => [e.entry.id, e.doc])).toEqual([['old-draft', 'W-02'], ['first', 'W-01']]);
  });
  it('orders essays published the same day by creation date, then slug', () => {
    const out = arrange([entry('b', '2026-02-01', '2026-06-01'), entry('a', '2026-03-01', '2026-06-01'), entry('c', '2026-02-01', '2026-06-01')]);
    expect(out.map((e) => [e.entry.id, e.doc])).toEqual([['a', 'W-03'], ['c', 'W-02'], ['b', 'W-01']]);
  });
  it('does not let unpublished essays leave gaps in the numbering', () => {
    const out = arrange([entry('x', '2026-01-01', null), entry('y', '2026-02-01', '2026-02-01')]);
    expect(out.map((e) => e.doc)).toEqual(['W-01']);
  });
  it('does not publish an essay whose published value is not a date', () => {
    expect(arrange([{ id: 'z', body: '', data: { created: new Date('2026-01-01'), published: 'true' as unknown as Date } }])).toEqual([]);
  });
});
