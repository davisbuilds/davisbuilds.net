// WHY: Verify inventory repositories at build time so a renamed or private repository blocks publication.

export type Lane = 'context' | 'evidence';

export type Part = {
  pn: string;
  repo: string;
  function: string;
  lang: string;
  /** Category label in the Home system diagram. */
  kind?: string;
  /** Diagram placement. Parts without a lane appear on Systems. */
  lane?: Lane;
  blurb?: string;
};

export const PARTS: Part[] = [
  { pn: 'AMON', repo: 'agentmonitor', function: 'Local observability for coding agents: sessions, tool calls, costs, search', lang: 'TypeScript', kind: 'observability', lane: 'evidence', blurb: 'Local observability for coding agents: sessions, tool calls, costs, search.' },
  { pn: 'DOJO', repo: 'dojo', function: 'Cross-harness skills, hooks, generated adapters, contract validation', lang: 'Python', kind: 'skills', lane: 'context', blurb: 'Cross-harness skills and hooks, with generated adapters and contract validation.' },
  { pn: 'ENGRAM', repo: 'engram', function: 'One canonical markdown memory store rendered into Claude Code and Codex', lang: 'Go', kind: 'memory', lane: 'context', blurb: 'One canonical markdown memory store, rendered into Claude Code and Codex.' },
  { pn: 'OPENBENCH', repo: 'openbench', function: 'Same model, different wrapper: harness benchmark on correctness, speed, cost', lang: 'Python', kind: 'eval', lane: 'evidence', blurb: 'Same model, different wrapper: harnesses compared on correctness, speed, and token cost.' },
  { pn: 'FETCHMD', repo: 'fetchmd', function: 'Token-efficient webpage-to-Markdown CLI for agents', lang: 'TypeScript', kind: 'cli', lane: 'context', blurb: 'Webpages in, token-efficient Markdown out.' },
  { pn: 'ENVDIFF', repo: 'envdiff', function: 'Deterministic environment-contract analysis for repositories', lang: 'Go' },
  { pn: 'ONESHOTS', repo: 'oneshots', function: 'Single-file capability demos, each labeled with the model that built it', lang: 'Python', kind: 'demos', lane: 'evidence', blurb: 'Single-file capability demos, each labeled with the model that built it.' },
  { pn: 'MLSEARCH', repo: 'mlsearch', function: 'Autoresearch experiment in semantic search over arXiv cs.LG', lang: 'Python' },
];

export type App = {
  name: string;
  kind: string;
  description: string;
  /** Public repository identifier when the source is available. */
  repo?: string;
  url?: string;
  featured?: boolean;
  /** Publication approval for the display name and curated live URL. */
  publishedBrand?: boolean;
};

export const APPS: App[] = [
  { name: 'Habits AI', kind: 'in development', description: 'Habit tracking with weekly AI insight reports.' },
  { name: 'podsave', kind: 'cli', description: 'A YouTube URL becomes a curated Obsidian note.', repo: 'podsave' },
  { name: 'feed', kind: 'cli', description: 'Newsletter digest CLI.', repo: 'feed' },
  { name: 'Influence Index', kind: 'web', description: 'An illustrated field guide to people who shaped industries, institutions, and culture.', repo: 'influence-index', url: 'https://influence-index-eta.vercel.app', featured: true },
  { name: 'Postcards', kind: 'web', description: 'Postcards from the places that stayed with me.', url: 'https://davis-postcards.vercel.app', featured: true, publishedBrand: true },
  { name: 'davisbuilds.net', kind: 'web', description: 'The source for this site, a static Astro build.', repo: 'davisbuilds.net' },
];

export const GITHUB_OWNER = 'davisbuilds';
export const repoUrl = (repo: string) => `https://github.com/${GITHUB_OWNER}/${repo}`;
