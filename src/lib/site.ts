// Pages that appear in the masthead navigation and the command palette.
// The sheet layout appends essays, oneshot runs and parts to the palette items.
export const NAV = [
  { href: '/', label: 'Home', key: 'home' },
  { href: '/writing/', label: 'Writing', key: 'writing' },
  { href: '/systems/', label: 'Systems', key: 'systems' },
  { href: '/oneshots/', label: 'Oneshots', key: 'oneshots' },
  { href: '/now/', label: 'Now', key: 'now' },
] as const;

export type NavKey = (typeof NAV)[number]['key'];

export type PaletteItem = { label: string; kind: string; href: string };

export const LINKS = [
  { label: 'GitHub', href: 'https://github.com/davisbuilds' },
  { label: 'X', href: 'https://x.com/davis_builds' },
  { label: 'Substack', href: 'https://davisbuilds.substack.com' },
  { label: 'LinkedIn', href: 'https://www.linkedin.com/in/nathaniel-davis-gee' },
  { label: 'Strava', href: 'https://www.strava.com/athletes/181121778' },
] as const;

export function basePaletteItems(): PaletteItem[] {
  return [
    ...NAV.map((n) => ({ label: n.label, kind: 'page', href: n.href })),
    ...LINKS.filter((l) => l.label === 'GitHub' || l.label === 'Substack').map((l) => ({ label: l.label, kind: 'link', href: l.href })),
  ];
}
