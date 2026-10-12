import { describe, expect, it } from 'vitest';
import { markExternalLinks } from '../../src/lib/external-links';

const NEW_TAB = 'target="_blank" rel="noopener"';

describe('markExternalLinks', () => {
  it('opens links to other sites in a new tab', () => {
    expect(markExternalLinks('<a href="https://github.com/davisbuilds">GitHub</a>')).toBe(`<a href="https://github.com/davisbuilds" ${NEW_TAB}>GitHub</a>`);
    expect(markExternalLinks('<a class="part" href="http://example.com/x?a=1&amp;b=2">x</a>')).toBe(`<a class="part" href="http://example.com/x?a=1&amp;b=2" ${NEW_TAB}>x</a>`);
    expect(markExternalLinks('<a href="//example.com/">x</a>')).toBe(`<a href="//example.com/" ${NEW_TAB}>x</a>`);
  });

  it('leaves links within the site alone', () => {
    for (const html of [
      '<a href="/writing/">Writing</a>',
      '<a href="#main">Skip</a>',
      '<a href="play/">Play</a>',
      '<a href="https://davisbuilds.net/now/">Now</a>',
      '<a href="https://www.davisbuilds.net/">Home</a>',
      '<a href="mailto:hi@example.com">Mail</a>',
      '<a id="x">No href</a>',
    ]) expect(markExternalLinks(html)).toBe(html);
  });

  it("keeps a link's own target and adds noopener to its own rel", () => {
    const own = '<a href="https://example.com/" target="_self">x</a>';
    expect(markExternalLinks(own)).toBe(own);
    expect(markExternalLinks('<a rel="me" href="https://x.com/davis_builds">X</a>')).toBe('<a rel="me noopener" href="https://x.com/davis_builds" target="_blank">X</a>');
  });

  it('reads a quoted ">" as part of the attribute', () => {
    expect(markExternalLinks('<a title="a > b" href="https://example.com/">x</a>')).toBe(`<a title="a > b" href="https://example.com/" ${NEW_TAB}>x</a>`);
  });

  it('leaves script and style bodies alone', () => {
    const html = '<script>const s = \'<a href="https://example.com/">\';</script><style>/* <a href="https://example.com/"> */</style>';
    expect(markExternalLinks(html)).toBe(html);
  });

  it('marks every link in a page, not just the first', () => {
    const out = markExternalLinks('<p><a href="https://a.example/">a</a> <a href="/b/">b</a> <A HREF="https://c.example/">c</A></p>');
    expect(out.match(/target="_blank"/g)).toHaveLength(2);
    expect(out).toContain('<a href="/b/">b</a>');
  });
});
