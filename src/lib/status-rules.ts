// The time-of-day status shown in the title block.
// It is a fixed rule table over the Eastern-time hour, never presence data.

export const STATUS_RULES: ReadonlyArray<{ until: number; label: string }> = [
  { until: 6, label: 'ASLEEP · AGENTS RUNNING' },
  { until: 9, label: 'AT THE GYM' },
  { until: 17, label: 'AT WORK' },
  { until: 23, label: 'BUILDING' },
  { until: 24, label: 'WINDING DOWN' },
];

export function statusForHour(hour: number): string {
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
    throw new RangeError(`hour must be an integer from 0 to 23, got ${hour}`);
  }
  return STATUS_RULES.find((r) => hour < r.until)!.label;
}

export function easternParts(date: Date): { hour: number; time: string } {
  const hour = Number(
    new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', hourCycle: 'h23' }).format(date),
  );
  const time = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' }).format(date);
  return { hour, time };
}
