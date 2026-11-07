import { describe, expect, it } from "vitest";
import {
  formatNumber,
  gridCoordinate,
  scaleAxis,
  ScalingError,
} from "@/lib/scaling";

describe("hand-worked axis scales", () => {
  it("divides the observed range and uses a sensible step without unnecessary expansion", () => {
    const axis = scaleAxis([2, 4, 12], 5);
    expect(axis).toMatchObject({
      minimum: 2,
      maximum: 12,
      range: 10,
      rawStep: 2,
      step: 2,
      start: 2,
      end: 12,
      boxes: 5,
      constant: false,
      adjusted: false,
    });
    expect(axis.ticks).toEqual([2, 4, 6, 8, 10, 12]);
  });

  it("increases the step when aligning the minimum would otherwise clip the maximum", () => {
    // Range 8 / 4 = 2, but 0 + 4*2 = 8 misses 9. Next sensible step is 5.
    const axis = scaleAxis([1, 9], 4);
    expect(axis).toMatchObject({
      range: 8,
      rawStep: 2,
      step: 5,
      start: 0,
      end: 20,
      adjusted: true,
    });
    expect(axis.ticks).toEqual([0, 5, 10, 15, 20]);
  });

  it("rounds a negative minimum down and keeps the positive maximum visible", () => {
    // Range 10 / 5 = 2. -4 + 5*2 = 6 misses 7; use -5 through 20 at step 5.
    expect(scaleAxis([-3, 7], 5)).toMatchObject({
      minimum: -3,
      maximum: 7,
      range: 10,
      rawStep: 2,
      step: 5,
      start: -5,
      end: 20,
    });
  });

  it("also handles an entirely negative dataset", () => {
    expect(scaleAxis([-9, -1], 4)).toMatchObject({
      range: 8,
      rawStep: 2,
      step: 5,
      start: -10,
      end: 10,
    });
  });

  it("places exact decimal ticks without binary multiplication artifacts", () => {
    const axis = scaleAxis([0.2, 0.8], 3);
    expect(axis.ticks).toEqual([0.2, 0.4, 0.6, 0.8]);
    expect(axis.ticks.map(formatNumber)).toEqual(["0.2", "0.4", "0.6", "0.8"]);
    expect(axis).toMatchObject({ range: 0.6, step: 0.2, start: 0.2, end: 0.8 });
  });

  it("uses a padded display for one point while retaining the true zero range", () => {
    expect(scaleAxis([0], 10)).toMatchObject({
      minimum: 0,
      maximum: 0,
      range: 0,
      rawStep: 0,
      constant: true,
      displayRange: 1,
      step: 0.1,
      start: -0.5,
      end: 0.5,
    });
  });

  it.each([5, -5])(
    "adds display space for equal values of %s, without inventing a data range",
    (value) => {
      const axis = scaleAxis([value, value, value], 10);
      expect(axis).toMatchObject({
        minimum: value,
        maximum: value,
        range: 0,
        rawStep: 0,
        constant: true,
      });
      expect(axis.start).toBeLessThan(value);
      expect(axis.end).toBeGreaterThan(value);
      expect(axis.end - axis.start).toBeCloseTo(1);
    },
  );

  it.each([
    { values: [0, 1e100], step: 1e99, start: 0, end: 1e100 },
    { values: [-1e100, 1e100], step: 2e99, start: -1e100, end: 1e100 },
    { values: [0, 1e-100], step: 1e-101, start: 0, end: 1e-100 },
  ])(
    "supports hand-worked large and small ranges: $values",
    ({ values, step, start, end }) => {
      const axis = scaleAxis(values, 10);
      expect(axis).toMatchObject({ step, start, end });
      expect(gridCoordinate(start, axis)).toBe(0);
      expect(gridCoordinate(end, axis)).toBeCloseTo(10);
    },
  );
});

describe("axis safety and plotting contract", () => {
  it.each([2, 3, 10, 49, 50])(
    "returns exactly %s boxes with ordered finite ticks and full data coverage",
    (boxes) => {
      for (const values of [
        [-13.8, 0, 27.2],
        [0.03, 0.8],
        [100, 101],
        [-1e90, 3e90],
        [4],
      ]) {
        const axis = scaleAxis(values, boxes);
        expect(axis.ticks).toHaveLength(boxes + 1);
        expect(axis.start).toBeLessThanOrEqual(Math.min(...values));
        expect(axis.end).toBeGreaterThanOrEqual(Math.max(...values));
        expect(axis.ticks[0]).toBe(axis.start);
        expect(axis.ticks.at(-1)).toBe(axis.end);
        expect(new Set(axis.ticks.map(formatNumber)).size).toBe(boxes + 1);
        axis.ticks.forEach((tick, index) => {
          expect(Number.isFinite(tick)).toBe(true);
          if (index) expect(tick).toBeGreaterThan(axis.ticks[index - 1]);
          expect(gridCoordinate(tick, axis)).toBeCloseTo(index, 8);
        });
        values.forEach((value) => {
          const position = gridCoordinate(value, axis);
          expect(position).toBeGreaterThanOrEqual(0);
          expect(position).toBeLessThanOrEqual(boxes);
        });
      }
    },
  );

  it.each([0, 1, 51, 2.5, NaN, Infinity])(
    "rejects unsupported box count %s",
    (boxes) => {
      expect(() => scaleAxis([0, 1], boxes)).toThrow(
        "Choose a whole number from 2 to 50 grid boxes.",
      );
    },
  );

  it("rejects an empty dataset and nonfinite values in plain language", () => {
    expect(() => scaleAxis([], 10)).toThrow("Enter at least one value");
    for (const value of [NaN, Infinity, -Infinity])
      expect(() => scaleAxis([0, value], 10)).toThrow("Use finite numbers");
  });

  it.each([
    { values: [1, 1 + Number.EPSILON] },
    { values: [0, Number.MIN_VALUE] },
    { values: [-Number.MAX_VALUE, Number.MAX_VALUE] },
  ])(
    "rejects unrepresentable ranges without returning misleading ticks",
    ({ values }) => {
      expect(() => scaleAxis(values, 50)).toThrow(ScalingError);
      expect(() => scaleAxis(values, 50)).toThrow(/precision|units/);
    },
  );

  it("rejects points outside the computed axis instead of clipping them silently", () => {
    const axis = scaleAxis([0, 10], 10);
    for (const value of [-1, 11, Infinity, NaN])
      expect(() => gridCoordinate(value, axis)).toThrow("outside this axis");
  });

  it("formats negative zero and scientific notation as readable finite numbers", () => {
    expect(formatNumber(-0)).toBe("0");
    expect(formatNumber(0.3)).toBe("0.3");
    expect(formatNumber(1e100)).toBe("1e+100");
    expect(formatNumber(1e-100)).toBe("1e-100");
  });
});
