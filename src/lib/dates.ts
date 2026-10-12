// A calendar date in YYYY-MM-DD form that names a real day. YAML and TOML
// parsers both roll an impossible day over (2026-02-31 becomes March 3), so
// essays and run manifests check their raw text with this too.
export function isCalendarDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}
