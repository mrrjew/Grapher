import { describe, expect, it } from "vitest";
import {
  emptyDraft,
  MAX_ROWS,
  parseNumber,
  readDraft,
  validateGraph,
  type GraphDraft,
} from "@/lib/graph-input";

const validDraft = (): GraphDraft => ({
  ...emptyDraft(),
  title: "Extension against load",
  xLabel: "Load",
  xUnit: "N",
  yLabel: "Extension",
  yUnit: "mm",
  rows: [{ id: "row-1", x: "1", y: "2" }],
});

describe("physics table number input", () => {
  it.each([
    ["2,5", 2.5],
    ["  -2,5  ", -2.5],
    ["+.5", 0.5],
    [",25", 0.25],
    ["1.25e3", 1250],
    ["-2,5E-3", -0.0025],
    ["0", 0],
    ["0e-999", 0],
    ["1e100", 1e100],
  ])("parses %s as %s", (text, expected) => {
    expect(parseNumber(text)).toBe(expected);
  });

  it.each([
    "",
    " ",
    "ten",
    "1,000,000",
    "1.000,5",
    "1,000.5",
    "1 000",
    "0x10",
    "NaN",
    "Infinity",
    "1e",
    "--2",
  ])("rejects invalid or ambiguous number %s", (text) => {
    expect(() => parseNumber(text)).toThrow();
  });

  it("interprets a single comma as a decimal separator, consistently", () => {
    expect(parseNumber("1,000")).toBe(1);
  });

  it.each(["1e999", "1e-999", "-3e-999"])(
    "explains numbers outside representable precision: %s",
    (text) => {
      expect(() => parseNumber(text)).toThrow("too large or too small");
    },
  );
});

describe("graph form validation", () => {
  it("accepts a single point, optional units and decimal commas", () => {
    const draft = validDraft();
    draft.xUnit = "";
    draft.yUnit = "";
    draft.rows[0] = { id: "row-1", x: "1,5", y: "-2,25" };
    expect(validateGraph(draft)).toEqual({
      errors: [],
      points: [{ x: 1.5, y: -2.25 }],
      xBoxes: 10,
      yBoxes: 10,
    });
  });

  it("ignores unused trailing blank rows", () => {
    const draft = validDraft();
    draft.rows.push({ id: "row-2", x: " ", y: "" });
    expect(validateGraph(draft).errors).toEqual([]);
    expect(validateGraph(draft).points).toEqual([{ x: 1, y: 2 }]);
  });

  it("identifies blank cells inside entered data and does not turn them into zeroes", () => {
    const draft = validDraft();
    draft.rows = [
      { id: "row-1", x: "1", y: "" },
      { id: "row-2", x: "", y: "" },
      { id: "row-3", x: "3", y: "4" },
    ];
    const result = validateGraph(draft);
    expect(result.errors.map((error) => error.field)).toEqual([
      "row-1-y",
      "row-2-x",
      "row-2-y",
    ]);
    expect(result.errors[0].message).toContain("Row 1, y");
    expect(result.points).toEqual([{ x: 3, y: 4 }]);
  });

  it("reports friendly errors for a completely blank or empty table", () => {
    expect(
      validateGraph(emptyDraft()).errors.some((error) =>
        error.message.includes("complete row"),
      ),
    ).toBe(true);
    const result = validateGraph({ ...validDraft(), rows: [] });
    expect(
      result.errors.some((error) => error.message.includes("complete row")),
    ).toBe(true);
    expect(result.points).toEqual([]);
  });

  it("identifies text entered in number fields and requires title/axis names", () => {
    const draft = emptyDraft();
    draft.rows[0] = { id: "row-1", x: "text", y: "2" };
    const result = validateGraph(draft);
    expect(result.errors.map((error) => error.field)).toEqual(
      expect.arrayContaining(["title", "xLabel", "yLabel", "row-1-x"]),
    );
    expect(
      result.errors.find((error) => error.field === "row-1-x")?.message,
    ).toContain("Enter a number");
  });

  it.each(["", "1", "51", "2.5", "2,5", "3e1", "-3", "word"])(
    "rejects invalid grid count %s",
    (value) => {
      const draft = validDraft();
      draft.xBoxes = value;
      expect(
        validateGraph(draft).errors.some((error) => error.field === "xBoxes"),
      ).toBe(true);
    },
  );
});

describe("untrusted local draft restoration", () => {
  it("round-trips incomplete entries without validating away the student’s work", () => {
    const draft = emptyDraft();
    draft.rows[0].x = "not finished";
    draft.title = "A draft";
    expect(readDraft(JSON.stringify(draft))).toEqual(draft);
  });

  it.each([
    null,
    [],
    "text",
    {},
    { ...validDraft(), title: 123 },
    { ...validDraft(), rows: [] },
    { ...validDraft(), rows: [{ id: "bad id", x: "", y: "" }] },
    { ...validDraft(), rows: [{ id: "ok", x: 4, y: "" }] },
  ])("rejects malformed stored draft safely", (data) => {
    expect(() => readDraft(JSON.stringify(data))).toThrow();
  });

  it("rejects oversized storage values, row counts, field lengths and duplicate row IDs", () => {
    expect(() => readDraft(" ".repeat(250001))).toThrow();
    expect(() =>
      readDraft(JSON.stringify({ ...validDraft(), title: "x".repeat(201) })),
    ).toThrow();
    expect(() =>
      readDraft(
        JSON.stringify({
          ...validDraft(),
          rows: Array.from({ length: MAX_ROWS + 1 }, (_, i) => ({
            id: `row-${i}`,
            x: "",
            y: "",
          })),
        }),
      ),
    ).toThrow();
    expect(() =>
      readDraft(
        JSON.stringify({
          ...validDraft(),
          rows: [
            { id: "same", x: "", y: "" },
            { id: "same", x: "", y: "" },
          ],
        }),
      ),
    ).toThrow();
  });

  it("discards unrecognized properties instead of trusting stored objects", () => {
    const result = readDraft(
      JSON.stringify({
        ...validDraft(),
        entitlement: "paid",
        rows: [{ id: "row-1", x: "1", y: "2", html: "<script>" }],
      }),
    );
    expect(result).toEqual(validDraft());
  });
});
