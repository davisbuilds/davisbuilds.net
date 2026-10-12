import { describe, expect, it } from 'vitest';
import rehypeSidenotes from '../../src/lib/rehype-sidenotes.mjs';

type Node = { type: string; tagName?: string; value?: string; properties?: Record<string, unknown>; children?: Node[] };
const t = (value: string): Node => ({ type: 'text', value });
const el = (tagName: string, properties: Record<string, unknown>, children: Node[] = []): Node => ({ type: 'element', tagName, properties, children });
const ref = (name: string, num: string, suffix = '') =>
  el('sup', {}, [el('a', { href: `#user-content-fn-${name}`, id: `user-content-fnref-${name}${suffix}`, dataFootnoteRef: true }, [t(num)])]);
const def = (name: string, children: Node[]) =>
  el('li', { id: `user-content-fn-${name}` }, [...children, t('\n')]);
const backref = (name: string) => el('a', { href: `#user-content-fnref-${name}`, dataFootnoteBackref: '' }, [t('↩')]);
const text = (n: Node): string => n.value ?? (n.children ?? []).map(text).join('');

function run(children: Node[]) {
  const tree: Node = { type: 'root', children };
  (rehypeSidenotes() as (tree: Node) => void)(tree);
  return tree.children!;
}

describe('rehypeSidenotes', () => {
  const footnotes = (...lis: Node[]) => el('section', { dataFootnotes: true, className: ['footnotes'] }, [el('h2', { id: 'footnote-label' }, [t('Footnotes')]), el('ol', {}, lis)]);

  it('replaces markers and places each note right after the block that cites it', () => {
    const out = run([
      el('p', {}, [t('First'), ref('a', '1'), t('.')]),
      el('p', {}, [t('Second.')]),
      el('ul', {}, [el('li', {}, [t('Item'), ref('b', '2')])]),
      footnotes(
        def('a', [el('p', {}, [t('Note A '), backref('a')])]),
        def('b', [el('p', {}, [t('Note B '), backref('b')])]),
      ),
    ]);
    expect(out.map((n) => n.tagName)).toEqual(['p', 'aside', 'p', 'ul', 'aside']);
    expect(out[1].properties).toMatchObject({ id: 'sn-a', role: 'note', className: ['sidenote'] });
    expect(text(out[1])).toBe('1. Note A');
    expect(text(out[4])).toBe('2. Note B');
    const marker = out[0].children![1];
    expect(marker).toMatchObject({ tagName: 'a', properties: { className: ['ref'], href: '#sn-a', dataNote: 'sn-a', id: 'ref-a' } });
  });

  it('places a note once when it is cited twice, and the second marker links to it', () => {
    const out = run([
      el('p', {}, [t('One'), ref('a', '1')]),
      el('p', {}, [t('Two'), ref('a', '1', '-2')]),
      footnotes(def('a', [el('p', {}, [t('Shared '), backref('a')])])),
    ]);
    expect(out.map((n) => n.tagName)).toEqual(['p', 'aside', 'p']);
    expect(out[2].children![1].properties).toMatchObject({ href: '#sn-a' });
    expect(out[2].children![1].properties).not.toHaveProperty('id');
  });

  it('removes the footnotes section and leaves documents without footnotes alone', () => {
    const plain = [el('p', {}, [t('No notes.')])];
    expect(run(plain)).toEqual(plain);
    const out = run([el('p', {}, [t('x'), ref('a', '1')]), footnotes(def('a', [el('p', {}, [t('n '), backref('a')])]))]);
    expect(out.some((n) => n.tagName === 'section')).toBe(false);
  });
});
