import { describe, expect, it } from 'vitest';
import { checkRawDates, essaySchema, isCalendarDate } from '../../src/lib/essay-schema';

const valid = {
  title: 'Fixture essay',
  description: 'A placeholder essay for tests.',
  created: '2026-01-01',
  updated: '2026-02-01',
  status: 'draft',
  confidence: 'likely',
  importance: 6,
  tags: ['fixtures'],
  written_by: 'by hand',
  published: '2026-01-15',
};

const rejects = (patch: Record<string, unknown>) => essaySchema.safeParse({ ...valid, ...patch }).success === false;

describe('essaySchema', () => {
  it('accepts a complete essay, with and without the optional URLs', () => {
    expect(essaySchema.safeParse(valid).success).toBe(true);
    expect(essaySchema.safeParse({ ...valid, also_on: 'https://example.substack.com/p/x', canonical: 'https://example.substack.com/p/x' }).success).toBe(true);
  });

  it('accepts updated on the same day as created', () => {
    expect(essaySchema.safeParse({ ...valid, updated: valid.created }).success).toBe(true);
  });

  it.each(['title', 'description', 'created', 'updated', 'status', 'confidence', 'importance', 'tags', 'written_by'])(
    'rejects an essay missing %s',
    (field) => {
      const { [field]: _, ...rest } = valid as Record<string, unknown>;
      expect(essaySchema.safeParse(rest).success).toBe(false);
    },
  );

  it('rejects unknown enum values', () => {
    expect(rejects({ status: 'published' })).toBe(true);
    expect(rejects({ confidence: 'very likely' })).toBe(true);
  });

  it('rejects importance outside 0 to 10 or not an integer', () => {
    expect(rejects({ importance: -1 })).toBe(true);
    expect(rejects({ importance: 11 })).toBe(true);
    expect(rejects({ importance: 6.5 })).toBe(true);
    expect(rejects({ importance: 0 })).toBe(false);
    expect(rejects({ importance: 10 })).toBe(false);
  });

  it('rejects empty written_by, including whitespace only', () => {
    expect(rejects({ written_by: '' })).toBe(true);
    expect(rejects({ written_by: '   ' })).toBe(true);
  });

  it('rejects empty and impossible dates instead of coercing them', () => {
    expect(rejects({ created: null })).toBe(true);
    expect(rejects({ created: '' })).toBe(true);
    expect(rejects({ created: '2026-02-31' })).toBe(true);
    expect(rejects({ created: new Date('invalid') })).toBe(true);
    expect(rejects({ created: new Date('2026-01-01T00:00:00Z') })).toBe(false);
  });

  it('rejects updated earlier than created', () => {
    expect(rejects({ created: '2026-02-01', updated: '2026-01-31' })).toBe(true);
  });

  it('rejects non-URL or non-https also_on and canonical', () => {
    expect(rejects({ also_on: 'substack' })).toBe(true);
    expect(rejects({ canonical: 'http://example.com/x' })).toBe(true);
  });

  it('rejects unknown fields, so a misspelled key cannot pass silently', () => {
    expect(rejects({ writen_by: 'typo' })).toBe(true);
  });

  it('treats a blank or missing published date as unpublished, not an error', () => {
    expect(essaySchema.parse({ ...valid, published: null }).published).toBeNull();
    expect(essaySchema.parse({ ...valid, published: '' }).published).toBeNull();
    const { published: _, ...unpublished } = valid;
    expect(essaySchema.parse(unpublished).published).toBeUndefined();
  });

  it('rejects published earlier than created', () => {
    expect(rejects({ created: '2026-02-01', published: '2026-01-31' })).toBe(true);
    expect(rejects({ created: '2026-02-01', published: '2026-02-01' })).toBe(false);
  });

  it('rejects the old publish switch and a published value that is not a date', () => {
    expect(rejects({ publish: true })).toBe(true);
    expect(rejects({ published: true })).toBe(true);
    expect(rejects({ published: 'yes' })).toBe(true);
  });
});

describe('raw date check', () => {
  it('accepts real dates, quoted or not, with trailing comments', () => {
    expect(checkRawDates('created: 2026-01-12\nupdated: "2026-03-04" # edited')).toEqual([]);
  });
  it('flags impossible days and empty values that YAML would roll over or null out', () => {
    expect(checkRawDates('created: 2026-02-31\nupdated: 2026-03-04')).toHaveLength(1);
    expect(checkRawDates('created:\nupdated: 2026-03-04')).toHaveLength(1);
    expect(checkRawDates('created: 2026-1-5')).toHaveLength(1);
    expect(checkRawDates('published: 2026-02-30')).toHaveLength(1);
  });
  it('lets published be blank, which means unpublished', () => {
    expect(checkRawDates('created: 2026-01-12\npublished:\nupdated: 2026-03-04')).toEqual([]);
    expect(checkRawDates('published: ""')).toEqual([]);
  });
  it('knows real calendar days', () => {
    expect(isCalendarDate('2028-02-29')).toBe(true);
    expect(isCalendarDate('2026-02-29')).toBe(false);
  });
});
