// Links to other sites open in a new tab (src/middleware.ts runs this over
// every rendered page). Attributes are matched whole, so a ">" inside a quoted
// value doesn't end the tag, and script and style bodies are left alone.
const ATTR = String.raw`\s+[^\s=>"'/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>"']+))?`;
const TOKEN = new RegExp(String.raw`<script\b[\s\S]*?</script\s*>|<style\b[\s\S]*?</style\s*>|<a((?:${ATTR})*)\s*>`, 'gi');
const SITE_HOSTS = new Set(['davisbuilds.net', 'www.davisbuilds.net']);

const attr = (attrs: string, name: string) => new RegExp(String.raw`\s${name}\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"']+))`, 'i').exec(attrs);

function isExternal(href: string): boolean {
  if (!/^(https?:)?\/\//i.test(href)) return false;
  try {
    return !SITE_HOSTS.has(new URL(href.replace(/&amp;/g, '&'), 'https://davisbuilds.net/').hostname);
  } catch {
    return false;
  }
}

export function markExternalLinks(html: string): string {
  return html.replace(TOKEN, (tag, attrs: string | undefined) => {
    if (attrs === undefined) return tag; // script or style
    const href = attr(attrs, 'href');
    if (!href || !isExternal(href[1] ?? href[2] ?? href[3]) || attr(attrs, 'target')) return tag;
    const rel = attr(attrs, 'rel');
    if (!rel) return `<a${attrs} target="_blank" rel="noopener">`;
    const value = rel[1] ?? rel[2] ?? rel[3];
    const merged = /(^|\s)noopener(\s|$)/i.test(value) ? attrs : attrs.replace(rel[0], ` rel="${value} noopener"`);
    return `<a${merged} target="_blank">`;
  });
}
