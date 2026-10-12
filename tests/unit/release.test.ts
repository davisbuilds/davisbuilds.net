import { describe, expect, it } from 'vitest';
import { urlFor } from '../../scripts/lib/release.mjs';

describe('urlFor (served-file verification)', () => {
  it('maps directory indexes to their directory', () => {
    expect(urlFor('index.html')).toBe('https://davisbuilds.net/');
    expect(urlFor('systems/index.html')).toBe('https://davisbuilds.net/systems/');
    expect(urlFor('404.html')).toBe('https://davisbuilds.net/404.html');
  });

  it('encodes each path segment, so a name with URL delimiters is fetched as itself', () => {
    expect(urlFor('oneshots/run/files/asset#x.png')).toBe('https://davisbuilds.net/oneshots/run/files/asset%23x.png');
    expect(urlFor('oneshots/run/files/a b?c%.js')).toBe('https://davisbuilds.net/oneshots/run/files/a%20b%3Fc%25.js');
    expect(urlFor('a#b/index.html')).toBe('https://davisbuilds.net/a%23b/');
  });
});
