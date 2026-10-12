// The Now page: what the owner is focused on, and the site's revision
// history. The owner edits this file; the Writing cell comes from the
// published essays instead, so it can't name an unpublished draft.

export const NOW = {
  updated: '2026-10-07',
  entries: [
    { label: 'Building', value: 'Context and verification tooling for coding agents', note: 'dojo, engram, and agentmonitor, mostly.' },
    { label: 'Reading', value: 'How To Write With An LLM', note: "sockpuppet.org. The rules this site's essays follow." },
    { label: 'Off the clock', value: 'Lifting, running, golf', note: 'Runs on', link: { label: 'Strava', href: 'https://www.strava.com/athletes/181121778' } },
  ],
};

export const REVISIONS = [
  { rev: 'A', description: 'First personal site', date: '2025' },
  { rev: 'B', description: 'Sidebar layout redesign', date: '2026-02' },
  { rev: 'C', description: 'Bio rewrite, projects page revamp', date: '2026-09-01' },
  { rev: 'D', description: 'This redesign: an Astro site in the engineering-drawing style', date: '2026-10' },
];
