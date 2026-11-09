import "server-only";
import { readDraft, validateGraph, type GraphDraft } from "./graph-input";
import { HttpError } from "./http";

export function graphForSave(value: unknown): GraphDraft {
  let draft: GraphDraft;
  try {
    draft = readDraft(JSON.stringify(value));
  } catch {
    throw new HttpError(
      "This graph could not be read. Check the title, labels and table size.",
    );
  }
  const validated = validateGraph(draft);
  if (validated.errors.length) throw new HttpError(validated.errors[0].message);
  const last = draft.rows.findLastIndex(
    (row) => row.x.trim() !== "" || row.y.trim() !== "",
  );
  return {
    ...draft,
    title: draft.title.trim(),
    xLabel: draft.xLabel.trim(),
    yLabel: draft.yLabel.trim(),
    xUnit: draft.xUnit.trim(),
    yUnit: draft.yUnit.trim(),
    rows: draft.rows
      .slice(0, last + 1)
      .map((row) => ({ ...row, x: row.x.trim(), y: row.y.trim() })),
  };
}
export function graphFromRow(row: Record<string, unknown>): GraphDraft {
  return readDraft(
    JSON.stringify({
      title: row.title,
      xLabel: row.x_label,
      xUnit: row.x_unit,
      yLabel: row.y_label,
      yUnit: row.y_unit,
      xBoxes: String(row.x_boxes),
      yBoxes: String(row.y_boxes),
      rows: row.rows,
    }),
  );
}
