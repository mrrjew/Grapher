"use client";

import { useEffect, useRef, useState } from "react";
import { draftKey, loadDraft, storeDraft } from "@/lib/graph-draft";
import {
  emptyDraft,
  MAX_ROWS,
  validateGraph,
  type GraphDraft,
  type FieldError,
  type Point,
} from "@/lib/graph-input";
import { scaleAxis, formatNumber as n, type AxisScale } from "@/lib/scaling";
import { GraphPreview } from "./graph-preview";
import "./graph-helper.css";
import { SavedGraphs } from "./saved-graphs";

type Result = { x: AxisScale; y: AxisScale; points: Point[] };
const axisLabel = (label: string, unit: string) =>
  unit.trim() ? `${label.trim()} (${unit.trim()})` : label.trim();

function AxisWorking({
  axis,
  name,
  label,
}: {
  axis: AxisScale;
  name: "X" | "Y";
  label: string;
}) {
  return (
    <section className="axis-working" aria-labelledby={`${name}-working`}>
      <h3 id={`${name}-working`}>{name} axis scaling</h3>
      <p className="axis-variable">{label}</p>
      <ol>
        <li>
          Find the highest value: <strong>{n(axis.maximum)}</strong>.
        </li>
        <li>
          Find the lowest value: <strong>{n(axis.minimum)}</strong>.
        </li>
        <li>
          Work out the range: {n(axis.maximum)} − ({n(axis.minimum)}) ={" "}
          <strong>{n(axis.range)}</strong>.
        </li>
        <li>
          Divide by {axis.boxes} grid boxes: {n(axis.range)} ÷ {axis.boxes} ={" "}
          <strong>{n(axis.rawStep)}</strong>.
          {axis.constant && (
            <p className="constant-note">
              The range is zero. To show the data, add a display span of{" "}
              {n(axis.displayRange)} around the value. Divide that span by{" "}
              {axis.boxes}: {n(axis.displayRange)} ÷ {axis.boxes} ={" "}
              {n(axis.displayRange / axis.boxes)}.
            </p>
          )}
        </li>
        <li>
          Round up to a sensible step: <strong>{n(axis.initialStep)}</strong>{" "}
          per box. Use 1, 2 or 5 multiplied by a power of ten.
          {axis.adjusted && (
            <p className="constant-note">
              After aligning the start, this step would leave a point outside
              the axis. Increase the step to <strong>{n(axis.step)}</strong> so
              every point fits in {axis.boxes} boxes.
            </p>
          )}
        </li>
        <li>
          Align the start to a step boundary at or below the lowest value
          {axis.constant ? " of the display span" : ""}. Count {axis.boxes}{" "}
          steps to find the end: {n(axis.start)} + ({axis.boxes} ×{" "}
          {n(axis.step)}) = <strong>{n(axis.end)}</strong>.
        </li>
      </ol>
      <dl className="axis-result" aria-label={`${name} axis result`}>
        <div>
          <dt>Start</dt>
          <dd>{n(axis.start)}</dd>
        </div>
        <div>
          <dt>End</dt>
          <dd>{n(axis.end)}</dd>
        </div>
        <div>
          <dt>Step per box</dt>
          <dd>{n(axis.step)}</dd>
        </div>
      </dl>
    </section>
  );
}

export function GraphHelper({
  userId,
  savingEnabled = false,
}: {
  userId: string;
  savingEnabled?: boolean;
}) {
  const [draft, setDraft] = useState<GraphDraft>(emptyDraft);
  const [ready, setReady] = useState(false);
  const [draftMessage, setDraftMessage] = useState("");
  const [errors, setErrors] = useState<FieldError[]>([]);
  const [result, setResult] = useState<Result | null>(null);
  const summary = useRef<HTMLDivElement>(null);
  const results = useRef<HTMLDivElement>(null);
  const ended = useRef(false);
  const touched = useRef(new Set<string>());
  const submitted = useRef(false);

  function validationErrors(next: GraphDraft): FieldError[] {
    const validated = validateGraph(next);
    const visible = validated.errors.filter(
      (error) => submitted.current || touched.current.has(error.field),
    );
    if (submitted.current && validated.errors.length === 0) {
      for (const axis of ["x", "y"] as const) {
        try {
          scaleAxis(
            validated.points.map((point) => point[axis]),
            validated[`${axis}Boxes`],
          );
        } catch (error) {
          visible.push({
            field: `${axis}Boxes`,
            message: `${axis.toUpperCase()} axis: ${(error as Error).message}`,
          });
        }
      }
    }
    return visible;
  }

  function touch(fieldId: string) {
    touched.current.add(fieldId);
    setErrors(validationErrors(draft));
  }

  useEffect(() => {
    touched.current.clear();
    submitted.current = false;
    setErrors([]);
    try {
      const saved = loadDraft(userId);
      if (saved) {
        setDraft(saved);
        setDraftMessage("Draft restored on this browser.");
      }
    } catch {
      setDraftMessage(
        "The draft could not be read. Your stored copy has not been replaced. Entering data will replace it.",
      );
    }
    setReady(true);
    function endSession(navigate = true) {
      ended.current = true;
      touched.current.clear();
      submitted.current = false;
      setDraft(emptyDraft());
      setResult(null);
      setErrors([]);
      try {
        localStorage.removeItem(draftKey(userId));
      } catch {
        /* Account navigation still proceeds. */
      }
      if (navigate) window.location.replace("/login");
    }
    function storageChanged(event: StorageEvent) {
      if (event.key !== draftKey(userId) && event.key !== null) return;
      if (event.newValue === null) {
        endSession();
        return;
      }
      try {
        // Storage events may be queued: use the latest value, not a stale payload.
        const latest = loadDraft(userId);
        if (!latest) {
          endSession();
          return;
        }
        setDraft(latest);
        touched.current.clear();
        submitted.current = false;
        setErrors([]);
        setResult(null);
        setDraftMessage(
          "Draft updated from another tab. The last edit is kept.",
        );
      } catch {
        setDraftMessage(
          "The draft from another tab could not be read. Your current table is still here.",
        );
      }
    }
    function cleared(event: Event) {
      if ((event as CustomEvent).detail === userId) endSession(false);
    }
    window.addEventListener("storage", storageChanged);
    window.addEventListener("physics-draft-cleared", cleared);
    return () => {
      window.removeEventListener("storage", storageChanged);
      window.removeEventListener("physics-draft-cleared", cleared);
    };
  }, [userId]);

  function update(next: GraphDraft, changedField?: string) {
    if (ended.current) return;
    if (changedField) touched.current.add(changedField);
    setDraft(next);
    setResult(null);
    setErrors(validationErrors(next));
    try {
      storeDraft(userId, next);
      setDraftMessage("Draft kept on this browser.");
    } catch {
      setDraftMessage(
        "The draft could not be saved on this browser. Keep this page open so you do not lose your table.",
      );
    }
  }

  function field(
    key: keyof Omit<GraphDraft, "rows">,
    label: string,
    maxLength: number,
    help?: string,
  ) {
    const error = errors.find((item) => item.field === key);
    return (
      <div className="field">
        <label htmlFor={`graph-${key}`}>{label}</label>
        <input
          id={`graph-${key}`}
          name={key}
          value={draft[key]}
          maxLength={maxLength}
          onChange={(event) =>
            update({ ...draft, [key]: event.target.value }, key)
          }
          onBlur={() => touch(key)}
          aria-invalid={Boolean(error)}
          aria-describedby={
            [
              help
                ? `help-${key}`
                : key === "xUnit" || key === "yUnit"
                  ? "graph-unit-help"
                  : undefined,
              error ? `error-${key}` : undefined,
            ]
              .filter(Boolean)
              .join(" ") || undefined
          }
          {...(key.endsWith("Boxes") ? { inputMode: "numeric" as const } : {})}
        />
        {help && (
          <p className="hint" id={`help-${key}`}>
            {help}
          </p>
        )}
        {error && (
          <p className="field-error" id={`error-${key}`}>
            {error.message}
          </p>
        )}
      </div>
    );
  }

  function calculate(event: React.FormEvent) {
    event.preventDefault();
    submitted.current = true;
    const validated = validateGraph(draft);
    if (validated.errors.length) {
      setErrors(validated.errors);
      setResult(null);
      setTimeout(() => summary.current?.focus(), 0);
      return;
    }
    let x: AxisScale | undefined;
    let y: AxisScale | undefined;
    const scaleErrors: FieldError[] = [];
    try {
      x = scaleAxis(
        validated.points.map((point) => point.x),
        validated.xBoxes,
      );
    } catch (error) {
      scaleErrors.push({
        field: "xBoxes",
        message: `X axis: ${(error as Error).message}`,
      });
    }
    try {
      y = scaleAxis(
        validated.points.map((point) => point.y),
        validated.yBoxes,
      );
    } catch (error) {
      scaleErrors.push({
        field: "yBoxes",
        message: `Y axis: ${(error as Error).message}`,
      });
    }
    if (!x || !y) {
      setResult(null);
      setErrors(scaleErrors);
      setTimeout(() => summary.current?.focus(), 0);
      return;
    }
    setErrors([]);
    setResult({ x, y, points: validated.points });
    setTimeout(() => results.current?.focus(), 0);
  }

  if (!ready)
    return (
      <section className="graph-helper">
        <h2>Graph helper</h2>
        <p role="status">Opening your table…</p>
      </section>
    );
  return (
    <section className="graph-helper" aria-labelledby="graph-helper-title">
      <div className="helper-intro">
        <h2 id="graph-helper-title">Graph helper</h2>
        <p>
          Enter your measurements, then check the scales and copy your graph
          onto paper.
        </p>
        <div className="draft-note">
          <p className="hint">
            Drafts stay on this device. Online saves are separate. Log out on
            shared devices.
          </p>
          <p className="draft-status" role="status">
            {draftMessage || "Your table is ready."}
          </p>
        </div>
      </div>
      {savingEnabled && (
        <SavedGraphs
          userId={userId}
          draft={draft}
          onLoad={(next) => {
            touched.current.clear();
            submitted.current = false;
            update(next);
            setErrors([]);
          }}
        />
      )}
      <div className="graph-workbench">
        <form className="graph-editor" onSubmit={calculate} noValidate>
          <section
            className="graph-section"
            aria-labelledby="graph-details-title"
          >
            <h3 id="graph-details-title">1. Name your graph</h3>
            {field("title", "Graph title", 200)}
            <div className="variable-fields">
              <fieldset>
                <legend>X axis</legend>
                <div className="axis-fields">
                  {field("xLabel", "X variable", 160)}
                  {field("xUnit", "X unit", 80)}
                </div>
              </fieldset>
              <fieldset>
                <legend>Y axis</legend>
                <div className="axis-fields">
                  {field("yLabel", "Y variable", 160)}
                  {field("yUnit", "Y unit", 80)}
                </div>
              </fieldset>
            </div>
            <p className="hint unit-help" id="graph-unit-help">
              Leave units blank for quantities without a unit.
            </p>
          </section>
          <section className="graph-section" aria-labelledby="data-title">
            <h3 id="data-title">2. Enter your data</h3>
            <p className="hint" id="number-help">
              Use a decimal point or comma: 2.5 and 2,5 mean the same value. Do
              not use thousands separators. Scientific notation, such as 1.2e-3,
              is accepted. Empty rows at the end are ignored.
            </p>
            <div className="data-table-wrap">
              <table className="data-table">
                <caption>Measurements to plot</caption>
                <thead>
                  <tr>
                    <th scope="col">Row</th>
                    <th scope="col">
                      {axisLabel(draft.xLabel || "X", draft.xUnit)}
                    </th>
                    <th scope="col">
                      {axisLabel(draft.yLabel || "Y", draft.yUnit)}
                    </th>
                    <th scope="col">
                      <span className="visually-hidden">Remove a row</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {draft.rows.map((row, index) => (
                    <tr key={row.id}>
                      <th scope="row">{index + 1}</th>
                      {(["x", "y"] as const).map((axis) => {
                        const fieldId = `${row.id}-${axis}`;
                        const error = errors.find(
                          (item) => item.field === fieldId,
                        );
                        return (
                          <td key={axis}>
                            <input
                              id={`graph-${fieldId}`}
                              aria-label={`Row ${index + 1}, ${axis} value`}
                              aria-invalid={Boolean(error)}
                              aria-describedby={
                                error ? `error-${fieldId}` : "number-help"
                              }
                              type="text"
                              inputMode="decimal"
                              autoComplete="off"
                              spellCheck={false}
                              value={row[axis]}
                              maxLength={80}
                              onChange={(event) =>
                                update(
                                  {
                                    ...draft,
                                    rows: draft.rows.map((item) =>
                                      item.id === row.id
                                        ? {
                                            ...item,
                                            [axis]: event.target.value,
                                          }
                                        : item,
                                    ),
                                  },
                                  fieldId,
                                )
                              }
                              onBlur={() => touch(fieldId)}
                            />
                            {error && (
                              <p
                                className="field-error"
                                id={`error-${fieldId}`}
                              >
                                {error.message}
                              </p>
                            )}
                          </td>
                        );
                      })}
                      <td>
                        <button
                          type="button"
                          className="remove-row"
                          aria-label={`Remove row ${index + 1}`}
                          disabled={draft.rows.length === 1}
                          onClick={() => {
                            update({
                              ...draft,
                              rows: draft.rows.filter(
                                (item) => item.id !== row.id,
                              ),
                            });
                            setTimeout(
                              () =>
                                document
                                  .getElementById(
                                    `graph-${draft.rows[index + 1]?.id || draft.rows[index - 1]?.id}-x`,
                                  )
                                  ?.focus(),
                              0,
                            );
                          }}
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button
              type="button"
              className="button secondary"
              disabled={draft.rows.length >= MAX_ROWS}
              onClick={() => {
                const id = crypto.randomUUID();
                update({
                  ...draft,
                  rows: [...draft.rows, { id, x: "", y: "" }],
                });
                setTimeout(
                  () => document.getElementById(`graph-${id}-x`)?.focus(),
                  0,
                );
              }}
            >
              Add row
            </button>
            {draft.rows.length >= MAX_ROWS && (
              <p className="hint">This table can hold up to {MAX_ROWS} rows.</p>
            )}
          </section>
          <section className="graph-section" aria-labelledby="boxes-title">
            <h3 id="boxes-title">3. Choose your grid boxes</h3>
            <p className="hint">
              Count the boxes you want along each axis on your paper. Choose 2
              to 50 for each axis.
            </p>
            <div className="grid-box-fields">
              {field("xBoxes", "X grid boxes", 3)}
              {field("yBoxes", "Y grid boxes", 3)}
            </div>
          </section>
          {submitted.current && errors.length > 0 && (
            <div
              className="graph-errors"
              ref={summary}
              tabIndex={-1}
              role="alert"
            >
              <h3>Check these entries</h3>
              <ul>
                {errors.map((error) => (
                  <li key={error.field}>
                    <a
                      href={`#graph-${error.field}`}
                      onClick={(event) => {
                        const target = document.getElementById(
                          `graph-${error.field}`,
                        );
                        if (target) {
                          event.preventDefault();
                          target.focus();
                        }
                      }}
                    >
                      {error.message}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <button type="submit" className="button calculate-button">
            Show scaling and preview
          </button>
        </form>
        {result ? (
          <div
            className="graph-results workspace-output"
            ref={results}
            tabIndex={-1}
            aria-label="Scaling and preview"
          >
            <div className="results-heading">
              <div>
                <p className="section-label">Your working</p>
                <h2>Work out your scales</h2>
              </div>
              <a className="preview-jump" href="#graph-preview">
                View graph preview <span aria-hidden="true">↓</span>
              </a>
            </div>
            {result.points.length === 1 && (
              <p className="message">
                You have one data point. You can plot it, but one point cannot
                show a trend. Add more measurements when you have them.
              </p>
            )}
            {result.points.length > 1 &&
              (result.x.constant || result.y.constant) && (
                <p className="message">
                  {result.x.constant && result.y.constant
                    ? "Both axes have"
                    : result.x.constant
                      ? "The x axis has"
                      : "The y axis has"}{" "}
                  identical values. The range is zero, so a display span is
                  added to make the points visible. Points at the same position
                  overlap.
                </p>
              )}
            <div className="axis-workings">
              <AxisWorking
                axis={result.x}
                name="X"
                label={axisLabel(draft.xLabel, draft.xUnit)}
              />
              <AxisWorking
                axis={result.y}
                name="Y"
                label={axisLabel(draft.yLabel, draft.yUnit)}
              />
            </div>
            <GraphPreview
              title={draft.title.trim()}
              xLabel={axisLabel(draft.xLabel, draft.xUnit)}
              yLabel={axisLabel(draft.yLabel, draft.yUnit)}
              points={result.points}
              x={result.x}
              y={result.y}
            />
          </div>
        ) : (
          <aside
            className="workspace-output results-placeholder"
            aria-labelledby="results-placeholder-title"
          >
            <p className="section-label">Scaling and plotting</p>
            <div className="empty-grid" aria-hidden="true">
              <svg viewBox="0 0 280 200" fill="none">
                <path
                  d="M40 20V170H260M40 140H260M40 110H260M40 80H260M40 50H260M70 20V170M100 20V170M130 20V170M160 20V170M190 20V170M220 20V170M250 20V170"
                  stroke="#dce3da"
                />
                <path d="M40 20V170H260" stroke="#77887b" strokeWidth="1.5" />
                <text x="19" y="28" fill="#52615a" fontSize="13">
                  y
                </text>
                <text x="254" y="190" fill="#52615a" fontSize="13">
                  x
                </text>
              </svg>
            </div>
            <h3 id="results-placeholder-title">Start with your measurements</h3>
            <p>
              Fill in the table and choose your grid boxes. Your worked scales
              and plotted points will appear here.
            </p>
            <p className="hint">
              The working shows how to choose a sensible scale for each axis.
            </p>
          </aside>
        )}
      </div>
    </section>
  );
}
