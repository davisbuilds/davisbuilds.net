import { describe, expect, it } from 'vitest';
import { checkCanaries, checkScopes, findNames, findPrivateNames, parseNamesFile, scannable, scanTargets } from '../../scripts/lib/private-names.mjs';

describe('findNames', () => {
  const texts: [string, string][] = [
    ['index.html', '<a href="https://github.com/someone/secret-tool">Secret-Tool</a> and devtools'],
    ['about.html', 'The Widget AI app, with its own devtools.'],
  ];

  it('finds a name standing as its own token, in any case', () => {
    expect(findNames(texts, ['secret-tool'])).toEqual(['index.html: secret-tool']);
  });

  it('ignores a name inside a longer word or a spaced display name', () => {
    expect(findNames(texts, ['tool', 'tools', 'widget-ai'])).toEqual([]);
  });

  it('finds a name at the end of a sentence or after a dot', () => {
    expect(findNames([['x.md', 'Built with widget.']], ['widget'])).toEqual(['x.md: widget']);
    expect(findNames([['x.css', '.secret-tool{color:red}']], ['secret-tool'])).toEqual(['x.css: secret-tool']);
  });
});

describe('scannable', () => {
  it('reads the site text but not demo files copied from the oneshots repository', () => {
    expect(scannable('index.html')).toBe(true);
    expect(scannable('oneshots/some-run/index.html')).toBe(true);
    expect(scannable('oneshots/some-run/files/src/app.js')).toBe(false);
    expect(scannable('images/plate.png')).toBe(false);
  });
});

describe('scanTargets', () => {
  it('scans built paths as well as text, so a private name in a file name is caught', () => {
    const built = ['index.html', 'images/secret-tool.png', 'oneshots/run/files/secret-tool.js'];
    const targets = scanTargets(built, () => 'nothing here');
    expect(targets.map(([label]: [string, string]) => label)).toEqual(['index.html', 'built paths']);
    expect(findNames(targets, ['secret-tool'])).toEqual(['built paths: secret-tool']);
  });
});

describe('the names file and its canaries', () => {
  it('separates plain names from github: canaries, ignoring comments', () => {
    expect(parseNamesFile('# note\nlocal-tool\ngithub: secret-tool  # must be listed\n\n')).toEqual({ names: ['local-tool'], canaries: ['secret-tool'] });
  });

  it('accepts a GitHub list that includes every canary', () => {
    expect(() => checkCanaries(['Secret-Tool', 'other'], ['secret-tool'])).not.toThrow();
  });

  it('refuses an empty or partial list, and a file with no canary', () => {
    expect(() => checkCanaries([], ['secret-tool'])).toThrow(/can't see private repositories secret-tool/);
    expect(() => checkCanaries(['other'], ['secret-tool'])).toThrow(/secret-tool/);
    expect(() => checkCanaries(['secret-tool'], [])).toThrow(/no `github:` canary/);
  });
});

describe('the token behind the GitHub list', () => {
  it('accepts a classic or OAuth token with the repo scope', () => {
    expect(() => checkScopes('HTTP/2.0 200 OK\nX-Oauth-Scopes: gist, repo, workflow\n\n{}')).not.toThrow();
  });

  it('refuses a token without repo, or one that reports no scopes (fine-grained, app)', () => {
    expect(() => checkScopes('HTTP/2.0 200 OK\nX-Oauth-Scopes: public_repo, gist\n\n{}')).toThrow(/repo scope/);
    expect(() => checkScopes('HTTP/2.0 200 OK\nX-Accepted-Oauth-Scopes: repo\n\n{}')).toThrow(/repo scope/);
  });
});

describe('explicit published application brands', () => {
  const base = { name: 'approved-widget', kind: 'web', description: 'A synthetic app.' };
  const apps = [{ ...base, url: 'https://example.com/approved-widget', publishedBrand: true }];

  it('permits the curated brand and exact live destination while still finding unrelated names', () => {
    expect(findPrivateNames([
      ['index.html', '<h3>Approved-Widget</h3><a href="https://example.com/approved-widget">Visit site</a> secret-tool'],
    ], ['approved-widget', 'secret-tool'], apps)).toEqual(['index.html: secret-tool']);
  });

  it('permits an exact live URL with the brand in its hostname, without exempting a longer destination', () => {
    const host = [{ ...base, url: 'https://approved-widget.example.com', publishedBrand: true }];
    expect(findPrivateNames([['index.html', '<a href="https://approved-widget.example.com">approved-widget</a>']], ['approved-widget'], host)).toEqual([]);
    expect(findPrivateNames([['index.html', '<a href="https://approved-widget.example.com/source">Source</a>']], ['approved-widget'], host)).toEqual(['index.html: approved-widget']);
  });

  it('does not permit source associations, other destinations or built paths for a published brand', () => {
    // WHY: Synthetic destinations exercise the policy without publishing the live allowlist.
    expect(findPrivateNames([
      ['source.html', '<a href="https://github.com/example/approved-widget">Source</a>'],
      ['other.html', 'https://other.example/approved-widget'],
      ['suffix.html', 'https://example.com/approved-widget/source'],
      ['bare.html', 'github.com/example/approved-widget'],
      ['escaped.json', String.raw`{"source":"https:\/\/github.com/example/approved-widget"}`],
      ['relative.html', '//github.com/example/approved-widget'],
      ['local.html', '<a href="/source/approved-widget">Source</a>'],
      ['markdown.md', '[Source](/source/approved-widget)'],
      ['built paths', 'images/approved-widget.png'],
    ], ['approved-widget'], apps)).toEqual([
      'source.html: approved-widget', 'other.html: approved-widget', 'suffix.html: approved-widget',
      'bare.html: approved-widget', 'escaped.json: approved-widget',
      'relative.html: approved-widget', 'local.html: approved-widget',
      'markdown.md: approved-widget', 'built paths: approved-widget',
    ]);
  });

  it('keeps path and source references protected across arbitrary text formats', () => {
    const texts: [string, string][] = [
      ['styles.css', '.preview { background: url(/source/approved-widget.png) }'],
      ['srcset.html', '<img srcset="/source/approved-widget.png 2x">'],
      ['data.html', '<div data-source="/source/approved-widget">'],
      ['reference.md', '[repo]: /source/approved-widget'],
      ['script.js', 'const source = "/source/approved-widget";'],
      ['plain.txt', 'Private source repository: example/approved-widget'],
      ['windows.txt', String.raw`Source: example\approved-widget`],
      ['filename.html', '<img srcset="approved-widget.png 2x">'],
    ];
    expect(findPrivateNames(texts, ['approved-widget'], apps)).toEqual(texts.map(([file]) => `${file}: approved-widget`));
  });

  it('requires explicit permission and a live URL, and matches only the complete brand', () => {
    const texts: [string, string][] = [['index.html', 'approved-widget secret-tool approved-widget-internal']];
    expect(findPrivateNames(texts, ['approved-widget'], [{ ...base, url: apps[0].url }])).toEqual(['index.html: approved-widget']);
    expect(findPrivateNames(texts, ['approved-widget'], [{ ...base, publishedBrand: true }])).toEqual(['index.html: approved-widget']);
    expect(findPrivateNames(texts, ['approved-widget-internal', 'secret-tool'], apps)).toEqual(['index.html: approved-widget-internal', 'index.html: secret-tool']);
  });
});
