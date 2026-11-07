/** Pure axis maths. No UI, storage or network dependencies. */
export class ScalingError extends Error {}

export type AxisScale = {
  minimum: number;
  maximum: number;
  range: number;
  boxes: number;
  rawStep: number;
  step: number;
  start: number;
  end: number;
  ticks: number[];
  constant: boolean;
  displayRange: number;
  adjusted: boolean;
  initialStep: number;
};

const precisionMessage =
  "These values cannot make a clear scale at this precision. Try different units or subtract a common reference value from the data.";
const stable = (value: number) => Number(value.toPrecision(15));

function niceStep(value: number) {
  const exponent = Math.floor(Math.log10(value));
  for (let power = exponent; power <= exponent + 1; power++) {
    for (const multiple of [1, 2, 5]) {
      const step = Number(`${multiple}e${power}`);
      if (step > 0 && Number.isFinite(step) && step >= value)
        return { multiple, exponent: power, value: step };
    }
  }
  throw new ScalingError(precisionMessage);
}

function nextStep(step: ReturnType<typeof niceStep>) {
  const multiple = step.multiple === 1 ? 2 : step.multiple === 2 ? 5 : 1;
  const exponent = step.exponent + (step.multiple === 5 ? 1 : 0);
  const value = Number(`${multiple}e${exponent}`);
  if (!Number.isFinite(value) || value <= step.value)
    throw new ScalingError(precisionMessage);
  return { multiple, exponent, value };
}

export function scaleAxis(values: readonly number[], boxes: number): AxisScale {
  if (!values.length)
    throw new ScalingError("Enter at least one value for this axis.");
  if (!Number.isInteger(boxes) || boxes < 2 || boxes > 50)
    throw new ScalingError("Choose a whole number from 2 to 50 grid boxes.");
  let minimum = Infinity;
  let maximum = -Infinity;
  for (const value of values) {
    if (!Number.isFinite(value))
      throw new ScalingError("Use finite numbers for every value.");
    minimum = Math.min(minimum, value);
    maximum = Math.max(maximum, value);
  }
  const range = stable(maximum - minimum);
  if (!Number.isFinite(range))
    throw new ScalingError(
      "The range is too large to calculate safely. Use different units to make the numbers smaller.",
    );
  const constant = range === 0;
  const padding = constant ? (minimum === 0 ? 1 : Math.abs(minimum) * 0.2) : 0;
  const lower = constant ? minimum - padding / 2 : minimum;
  const upper = constant ? maximum + padding / 2 : maximum;
  const displayRange = constant ? stable(upper - lower) : range;
  const rawStep = range / boxes;
  const targetStep = stable(displayRange / boxes);
  if (
    !Number.isFinite(lower) ||
    !Number.isFinite(upper) ||
    !Number.isFinite(targetStep) ||
    targetStep <= 0 ||
    lower >= upper
  )
    throw new ScalingError(precisionMessage);
  let step = niceStep(targetStep);
  const firstStep = step.value;

  for (let attempt = 0; attempt < 12; attempt++) {
    // Decimal lattice construction avoids 3 × 0.1 showing as 0.30000000000000004.
    const tick = (index: number) =>
      Number(`${index * step.multiple}e${step.exponent}`);
    let index = Math.floor(lower / step.value);
    if (
      !Number.isSafeInteger(index) ||
      !Number.isSafeInteger((index + boxes + 1) * step.multiple)
    )
      throw new ScalingError(precisionMessage);
    if (tick(index) > lower) index--;
    else if (tick(index + 1) <= lower) index++;
    if (
      !Number.isSafeInteger(index * step.multiple) ||
      !Number.isSafeInteger((index + boxes) * step.multiple)
    ) throw new ScalingError(precisionMessage);
    const ticks = Array.from({ length: boxes + 1 }, (_, offset) =>
      tick(index + offset),
    );
    const start = ticks[0];
    const end = ticks[boxes];
    if (
      ticks.some(
        (value, i) =>
          !Number.isFinite(value) || (i > 0 && value <= ticks[i - 1]),
      )
    )
      throw new ScalingError(precisionMessage);
    if (start <= lower && end >= upper) {
      // Distinct numerical ticks must also have distinct readable labels.
      if (new Set(ticks.map(formatNumber)).size !== ticks.length)
        throw new ScalingError(precisionMessage);
      return {
        minimum,
        maximum,
        range,
        boxes,
        rawStep,
        step: step.value,
        start,
        end,
        ticks,
        constant,
        displayRange,
        adjusted: step.value !== firstStep,
        initialStep: firstStep,
      };
    }
    step = nextStep(step);
  }
  throw new ScalingError(precisionMessage);
}

export function formatNumber(value: number): string {
  if (Object.is(value, -0) || value === 0) return "0";
  return Number(value.toPrecision(15)).toString();
}

/** Plot in grid-box coordinates so Chart.js also supports very large/small units. */
export function gridCoordinate(value: number, axis: AxisScale): number {
  if (!Number.isFinite(value) || value < axis.start || value > axis.end)
    throw new ScalingError(
      "A point falls outside this axis. Calculate the scale again.",
    );
  const coordinate = (value - axis.start) / axis.step;
  if (!Number.isFinite(coordinate)) throw new ScalingError(precisionMessage);
  return Math.max(0, Math.min(axis.boxes, coordinate));
}
