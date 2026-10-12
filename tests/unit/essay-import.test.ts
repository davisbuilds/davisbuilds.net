import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { convertNote, slugFromFileName, sourceOf } from '../../src/lib/essay-import';
import { checkRawDates, essaySchema } from '../../src/lib/essay-schema';

const BODY = 'An opening paragraph.\n\n## What worked\n\n1. **A point.** With a [link](https://example.com/).\n';

// A vault Writing note as Obsidian saves it: vault key order, `type`, and the
// `writing` collection tag.
const note = (patch: Record<string, string> = {}, body = BODY) => {
  const fields: Record<string, string> = {
    title: 'Working with Agents',
    description: 'Lessons from building with agents over the past year',
    type: 'article',
    status: 'finished',
    confidence: 'likely',
    importance: '8',
    created: '2026-08-16',
    updated: '2026-10-09',
    written_by: 'Davis',
    published: '2026-10-10',
    tags: '\n  - agents\n  - writing',
    ...patch,
  };
  const lines = Object.entries(fields).filter(([, v]) => v !== '<omit>').map(([k, v]) => (v.startsWith('\n') || v === '' ? `${k}:${v}` : `${k}: ${v}`));
  return `---\n${lines.join('\n')}\n---\n${body}`;
};

const problems = (text: string, file = 'Working with Agents.md'): string => {
  try {
    convertNote(text, file);
  } catch (e) {
    return (e as Error).message;
  }
  throw new Error('expected convertNote to refuse the note');
};

const frontmatterOf = (markdown: string) => markdown.match(/^---\n([\s\S]*?)\n---\n/)![1];

describe('slugFromFileName', () => {
  it('makes the URL slug from the note name', () => {
    expect(slugFromFileName('Working with Agents.md')).toBe('working-with-agents');
    expect(slugFromFileName('25y - what I’d say to 18y me.md')).toBe('25y-what-id-say-to-18y-me');
    expect(slugFromFileName('On-prem is so back.md')).toBe('on-prem-is-so-back');
    expect(slugFromFileName('The Self-Governing System That Couldn\'t See Itself.md')).toBe('the-self-governing-system-that-couldnt-see-itself');
  });
});

describe('convertNote', () => {
  it('drops vault-only keys and the writing tag, keeps the body byte for byte', () => {
    const { slug, markdown } = convertNote(note(), 'Working with Agents.md');
    expect(slug).toBe('working-with-agents');
    const fm = frontmatterOf(markdown);
    expect(fm).not.toMatch(/^type:/m);
    expect(fm).toMatch(/^tags: \["agents"\]$/m);
    expect(markdown.endsWith(`---\n${BODY}`)).toBe(true);
  });

  it('writes frontmatter the site build accepts, with the same values', () => {
    const fm = frontmatterOf(convertNote(note({ also_on: 'https://davisbuilds.substack.com/p/working-with-agents' }), 'x.md').markdown);
    expect(checkRawDates(fm)).toEqual([]);
    const data = essaySchema.parse(parse(fm, { schema: 'core' }));
    expect(data).toMatchObject({ title: 'Working with Agents', importance: 8, confidence: 'likely', written_by: 'Davis', tags: ['agents'], also_on: 'https://davisbuilds.substack.com/p/working-with-agents' });
    expect(data.published?.toISOString().slice(0, 10)).toBe('2026-10-10');
  });

  it('quotes text that YAML would otherwise misread', () => {
    const fm = frontmatterOf(convertNote(note({ title: '"Yes: no # maybe"' }), 'x.md').markdown);
    expect(fm).toMatch(/^title: "Yes: no # maybe"$/m);
  });

  it('keeps checking values when a field is blank, so one run lists everything', () => {
    const msg = problems(note({ title: '', confidence: 'very likely', updated: '2026-02-30' }));
    expect(msg).toContain('`title` is blank');
    expect(msg).toContain('confidence');
    expect(msg).toContain('updated');
    expect(msg.match(/title/g)).toHaveLength(1);
  });

  it('lists every blank field the site needs, not just the first', () => {
    const msg = problems(note({ confidence: '', written_by: '', published: '' }));
    expect(msg).toContain('`confidence` is blank');
    expect(msg).toContain('`written_by` is blank');
    expect(msg).toContain('`published` is blank');
  });

  it('refuses a note tagged ai-generated', () => {
    expect(problems(note({ tags: '\n  - agents\n  - ai-generated\n  - writing' }))).toContain('ai-generated');
  });

  it('compares tags trimmed and in any case, as Obsidian does', () => {
    expect(problems(note({ tags: '\n  - agents\n  - " ai-generated "' }))).toContain('ai-generated');
    expect(problems(note({ tags: '\n  - agents\n  - AI-Generated' }))).toContain('ai-generated');
    const fm = frontmatterOf(convertNote(note({ tags: '\n  - " agents "\n  - Writing' }), 'x.md').markdown);
    expect(fm).toMatch(/^tags: \["agents"\]$/m);
  });

  it('records which note it came from, in a comment the build ignores', () => {
    const { markdown } = convertNote(note(), 'Working with Agents.md');
    expect(sourceOf(markdown)).toBe('Working with Agents.md');
    const nested = convertNote(note(), 'Working with Agents.md', 'Projects/Writing/Working with Agents.md').markdown;
    expect(sourceOf(nested)).toBe('Projects/Writing/Working with Agents.md');
    expect(sourceOf('---\ntitle: "Hand-written"\n---\nBody\n')).toBeNull();
  });

  it('refuses tags that are not a list of text, so ai-generated cannot slip through', () => {
    expect(problems(note({ tags: 'ai-generated' }))).toContain('`tags` must be a list');
    expect(problems(note({ tags: '\n  - agents\n  - 7' }))).toContain('`tags` must be a list');
    expect(problems(note({ tags: '\n  - agents\n  - [ai-generated]' }))).toContain('`tags` must be a list');
  });

  it('refuses values the site rejects, with a hint for importance saved as text', () => {
    expect(problems(note({ confidence: 'very likely' }))).toContain('confidence');
    expect(problems(note({ importance: '"8"' }))).toContain('Number');
    expect(problems(note({ published: '2026-08-01' }))).toContain('`published` is earlier than `created`');
  });

  it('refuses a misspelled key and a note that is not an article', () => {
    expect(problems(note({ confidance: 'likely' }))).toContain('`confidance`');
    expect(problems(note({ type: 'edit-notes' }))).toContain('type: article');
    expect(problems('No frontmatter here.\n')).toContain('frontmatter');
  });

  it('refuses Obsidian-only syntax, naming its line in the note', () => {
    const line3 = note({}, '').split('\n').length + 2; // third line of the body
    for (const [line, kind] of [
      ['See [[Other Note]].', 'wikilink'],
      ['![[diagram.png]]', 'wikilink'],
      ['This is ==highlighted== text.', 'highlight'],
      ['%% a private comment %%', 'comment'],
      ['> [!note] A callout', 'callout'],
    ]) {
      const msg = problems(note({}, `First line.\n\n${line}\n`));
      expect(msg, line).toContain(kind);
      expect(msg, line).toContain(`line ${line3}:`);
    }
  });

  it('allows that syntax inside code, where it is shown rather than used', () => {
    const body = 'Use `[[wikilinks]]` and `==marks==` sparingly, or escape them: \\[\\[Example\\]\\], \\[[Half]], \\%\\%, \\%%, \\=\\=x\\=\\=.\n\n> \\[!note] shown, not a callout\n\n```md\n[[Note]] %% hidden %%\n> [!tip] x\n```\n\n    [[Indented]] ==code== %%\n\n~~~\n[[Tilde]]\n~~~\n';
    expect(convertNote(note({}, body), 'x.md').markdown.endsWith(body)).toBe(true);
  });
});
