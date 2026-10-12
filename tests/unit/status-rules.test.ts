import { describe, expect, it } from 'vitest';
import { easternParts, statusForHour } from '../../src/lib/status-rules';

describe('statusForHour', () => {
  const expected: Record<number, string> = {
    0: 'ASLEEP · AGENTS RUNNING', 5: 'ASLEEP · AGENTS RUNNING',
    6: 'AT THE GYM', 8: 'AT THE GYM',
    9: 'AT WORK', 16: 'AT WORK',
    17: 'BUILDING', 22: 'BUILDING',
    23: 'WINDING DOWN',
  };

  it('maps every rule boundary to its label', () => {
    for (const [hour, label] of Object.entries(expected)) {
      expect(statusForHour(Number(hour))).toBe(label);
    }
  });

  it('returns a non-empty label for all 24 hours', () => {
    const labels = Array.from({ length: 24 }, (_, h) => statusForHour(h));
    expect(labels.every((l) => l.length > 0)).toBe(true);
    expect(new Set(labels).size).toBe(5);
  });

  it('rejects hours outside 0-23', () => {
    for (const bad of [-1, 24, 3.5, Number.NaN]) {
      expect(() => statusForHour(bad)).toThrow(RangeError);
    }
  });
});

describe('easternParts', () => {
  it('reads the hour in America/New_York, not the machine timezone', () => {
    // 2026-10-07T04:30Z is 00:30 EDT.
    expect(easternParts(new Date('2026-10-07T04:30:00Z')).hour).toBe(0);
    // 2026-01-15T14:00Z is 09:00 EST.
    expect(easternParts(new Date('2026-01-15T14:00:00Z')).hour).toBe(9);
  });
});
