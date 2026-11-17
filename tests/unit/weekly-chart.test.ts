import { describe, expect, it } from 'vitest';
import { axisMax } from '../../src/scripts/crosshair';

describe('weekly contribution axis', () => {
  it('uses a readable top near the measured peak, including just over the old 400 boundary', () => {
    expect(axisMax(348)).toEqual({ max: 500, step: 100 });
    expect(axisMax(460)).toEqual({ max: 600, step: 100 });
    expect(axisMax(401)).toEqual({ max: 500, step: 100 });
    expect(axisMax(500)).toEqual({ max: 600, step: 100 });
  });

  it('keeps a nonzero integer scale for an empty week or invalid standalone input', () => {
    for (const peak of [0, -1, NaN, Infinity]) {
      expect(axisMax(peak)).toEqual({ max: 4, step: 1 });
    }
    expect(axisMax(1)).toEqual({ max: 2, step: 1 });
  });

  it('scales large counts without clipping or falling back to a tiny axis', () => {
    for (const peak of [4_001, 10_000, 345_678, 5e15, Number.MAX_SAFE_INTEGER]) {
      const { max, step } = axisMax(peak);
      expect(max).toBeGreaterThanOrEqual(peak * 1.2);
      expect(max).toBeLessThanOrEqual(peak * 1.6);
      expect(Number.isFinite(max)).toBe(true);
      expect(step).toBeGreaterThan(0);
      expect(max / step).toBeGreaterThanOrEqual(3);
      expect(max / step).toBeLessThanOrEqual(6);
      expect(max / step).toBeCloseTo(Math.round(max / step), 8);
    }
  });
});
