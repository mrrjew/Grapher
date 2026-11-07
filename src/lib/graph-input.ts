export type DataRow = { id: string; x: string; y: string };
export type GraphDraft = {
  title: string;
  xLabel: string;
  xUnit: string;
  yLabel: string;
  yUnit: string;
  xBoxes: string;
  yBoxes: string;
  rows: DataRow[];
};
export type Point = { x: number; y: number };
export type FieldError = { field: string; message: string };
export const MAX_ROWS = 1000;
export const emptyDraft = (): GraphDraft => ({
  title: "",
  xLabel: "",
  xUnit: "",
  yLabel: "",
  yUnit: "",
  xBoxes: "10",
  yBoxes: "10",
  rows: [1, 2, 3].map((i) => ({ id: `row-${i}`, x: "", y: "" })),
});

export function parseNumber(text: string): number {
  const value = text.trim();
  if (!value) throw new Error("Enter a number.");
  if (!/^[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:e[+-]?\d+)?$/i.test(value))
    throw new Error(
      "Enter a number, such as 2.5 or 2,5. Do not use thousands separators.",
    );
  const number = Number(value.replace(",", "."));
  const mantissa = value.split(/e/i)[0];
  if (!Number.isFinite(number) || (number === 0 && /[1-9]/.test(mantissa)))
    throw new Error(
      "This number is too large or too small. Try different units.",
    );
  return number;
}

export function validateGraph(draft: GraphDraft): {
  errors: FieldError[];
  points: Point[];
  xBoxes: number;
  yBoxes: number;
} {
  const errors: FieldError[] = [];
  const points: Point[] = [];
  for (const [field, label] of [
    ["title", "a graph title"],
    ["xLabel", "the x variable name"],
    ["yLabel", "the y variable name"],
  ] as const) {
    if (!draft[field].trim())
      errors.push({ field, message: `Enter ${label}.` });
  }
  const boxes = (field: "xBoxes" | "yBoxes") => {
    const value = Number(draft[field]);
    if (
      !/^\d+$/.test(draft[field]) ||
      !Number.isInteger(value) ||
      value < 2 ||
      value > 50
    )
      errors.push({
        field,
        message: `${field === "xBoxes" ? "X" : "Y"} axis: choose a whole number from 2 to 50 grid boxes.`,
      });
    return value;
  };
  const xBoxes = boxes("xBoxes");
  const yBoxes = boxes("yBoxes");
  const last = draft.rows.findLastIndex(
    (row) => row.x.trim() !== "" || row.y.trim() !== "",
  );
  if (last === -1)
    errors.push({
      field: draft.rows[0] ? `${draft.rows[0].id}-x` : "rows",
      message: "Enter at least one complete row of x and y values.",
    });
  draft.rows.slice(0, last + 1).forEach((row, index) => {
    const point: Partial<Point> = {};
    for (const axis of ["x", "y"] as const) {
      try {
        point[axis] = parseNumber(row[axis]);
      } catch (error) {
        errors.push({
          field: `${row.id}-${axis}`,
          message: `Row ${index + 1}, ${axis}: ${(error as Error).message}`,
        });
      }
    }
    if (point.x !== undefined && point.y !== undefined)
      points.push(point as Point);
  });
  return { errors, points, xBoxes, yBoxes };
}

/** Treat browser storage as untrusted; reject oversized or malformed drafts. */
export function readDraft(value: string): GraphDraft {
  if (value.length > 250000) throw new Error("Draft is too large.");
  const data = JSON.parse(value);
  if (!data || typeof data !== "object" || Array.isArray(data))
    throw new Error("Invalid draft.");
  const limits = {
    title: 200,
    xLabel: 160,
    yLabel: 160,
    xUnit: 80,
    yUnit: 80,
    xBoxes: 3,
    yBoxes: 3,
  } as const;
  const result = emptyDraft();
  for (const field of Object.keys(limits) as (keyof typeof limits)[]) {
    if (typeof data[field] !== "string" || data[field].length > limits[field])
      throw new Error("Invalid draft.");
    result[field] = data[field];
  }
  if (
    !Array.isArray(data.rows) ||
    data.rows.length < 1 ||
    data.rows.length > MAX_ROWS
  )
    throw new Error("Invalid rows.");
  const ids = new Set<string>();
  result.rows = data.rows.map((row: DataRow) => {
    if (
      !row ||
      typeof row.id !== "string" ||
      !/^[a-zA-Z0-9-]{1,64}$/.test(row.id) ||
      ids.has(row.id) ||
      typeof row.x !== "string" ||
      typeof row.y !== "string" ||
      row.x.length > 80 ||
      row.y.length > 80
    )
      throw new Error("Invalid row.");
    ids.add(row.id);
    return { id: row.id, x: row.x, y: row.y };
  });
  return result;
}
