import { describe, expect, it } from "vitest";
import { graphForSave, graphFromRow } from "@/lib/saved-graphs";
import { emptyDraft } from "@/lib/graph-input";
const valid = () => ({
  ...emptyDraft(),
  title: "  Spring graph  ",
  xLabel: "Force",
  yLabel: "Extension",
  rows: [
    { id: "row-1", x: "1,5", y: "2" },
    { id: "row-2", x: "", y: "" },
  ],
});
describe("server-side saved graph validation", () => {
  it("normalizes copied surrounding whitespace consistently with browser parsing", () => {
    expect(
      graphForSave({
        ...valid(),
        rows: [{ id: "row-1", x: "\u00a01,5\u00a0", y: "\t2 " }],
      }).rows[0],
    ).toEqual({ id: "row-1", x: "1,5", y: "2" });
  });
  it("preserves decimal commas and strips only trailing empty rows", () => {
    const result = graphForSave(valid());
    expect(result.title).toBe("Spring graph");
    expect(result.rows).toEqual([{ id: "row-1", x: "1,5", y: "2" }]);
  });
  it("rejects malformed structures, missing labels and invalid numbers", () => {
    for (const value of [
      null,
      {},
      { ...valid(), title: "" },
      { ...valid(), xBoxes: "0" },
      { ...valid(), rows: [{ id: "row-1", x: "hello", y: "2" }] },
      { ...valid(), rows: [{ id: "row-1", x: "1", y: "" }] },
    ])
      expect(() => graphForSave(value)).toThrow();
  });
  it("rejects oversized or duplicate rows before database submission", () => {
    expect(() =>
      graphForSave({ ...valid(), title: "x".repeat(201) }),
    ).toThrow();
    expect(() =>
      graphForSave({
        ...valid(),
        rows: [
          { id: "same", x: "1", y: "2" },
          { id: "same", x: "3", y: "4" },
        ],
      }),
    ).toThrow();
  });
  it("restores the database representation without accepting arbitrary extra fields", () => {
    expect(
      graphFromRow({
        title: "Spring",
        x_label: "Force",
        x_unit: "N",
        y_label: "Length",
        y_unit: "m",
        x_boxes: 12,
        y_boxes: 8,
        rows: [{ id: "row-1", x: "1", y: "2" }],
        user_id: "ignored",
      }),
    ).toMatchObject({ title: "Spring", xBoxes: "12", yBoxes: "8" });
  });
});
