"use client";

import { useEffect, useRef, useState } from "react";
import {
  Chart,
  ScatterController,
  PointElement,
  LinearScale,
  Tooltip,
} from "chart.js";
import { formatNumber, gridCoordinate, type AxisScale } from "@/lib/scaling";
import type { Point } from "@/lib/graph-input";

Chart.register(ScatterController, PointElement, LinearScale, Tooltip);

export function GraphPreview({
  title,
  xLabel,
  yLabel,
  points,
  x,
  y,
}: {
  title: string;
  xLabel: string;
  yLabel: string;
  points: Point[];
  x: AxisScale;
  y: AxisScale;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!canvas.current) return;
    let chart: Chart<"scatter"> | undefined;
    try {
      const axis = (scale: AxisScale, label: string) => ({
        type: "linear" as const,
        min: 0,
        max: scale.boxes,
        offset: false,
        title: {
          display: true,
          text: label,
          color: "#202b28",
          font: { size: 13 },
        },
        ticks: {
          stepSize: 1,
          autoSkip: false,
          maxRotation: 0,
          color: "#36473e",
          font: { size: 11 },
          callback: (value: string | number) => {
            const index = Number(value);
            return index === scale.boxes ||
              index % Math.ceil(scale.boxes / 10) === 0
              ? formatNumber(scale.ticks[index])
              : "";
          },
        },
        grid: { color: "#d8e0d6", tickColor: "#718779" },
        border: { color: "#52615a" },
      });
      chart = new Chart(canvas.current, {
        type: "scatter",
        data: {
          datasets: [
            {
              data: points.map((point) => ({
                x: gridCoordinate(point.x, x),
                y: gridCoordinate(point.y, y),
              })),
              pointStyle: "crossRot",
              pointRadius: 5,
              pointHoverRadius: 6,
              borderColor: "#173d2c",
              borderWidth: 2,
              clip: false,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          scales: { x: axis(x, xLabel), y: axis(y, yLabel) },
          plugins: {
            tooltip: {
              callbacks: {
                label: (context) => {
                  const point = points[context.dataIndex];
                  return `${xLabel}: ${formatNumber(point.x)}; ${yLabel}: ${formatNumber(point.y)}`;
                },
              },
            },
          },
        },
      });
      setError(false);
    } catch {
      Chart.getChart(canvas.current)?.destroy();
      setError(true);
    }
    return () => chart?.destroy();
  }, [title, xLabel, yLabel, points, x, y]);

  return (
    <section
      id="graph-preview"
      tabIndex={-1}
      className="graph-preview"
      aria-labelledby="preview-title"
    >
      <h3 id="preview-title">Graph preview</h3>
      <p>
        Copy the axes and points onto your graph paper. Each grid line is one
        box. Some labels are omitted to keep the preview readable.
      </p>
      <h4 className="plot-title">{title}</h4>
      {error && (
        <p role="alert">
          The preview could not be drawn. Your table and scaling steps are still
          available. Try showing the preview again.
        </p>
      )}
      <p className="hint preview-scroll-hint" id="preview-scroll-help">
        Scroll sideways to see the full graph on a small screen.
      </p>
      <div
        className="preview-scroll"
        tabIndex={0}
        role="region"
        aria-label="Graph preview scroll area"
        aria-describedby="preview-scroll-help"
      >
        <div className="preview-canvas">
          <canvas
            ref={canvas}
            role="img"
            aria-hidden={error || undefined}
            aria-label={`${title}. ${points.length} plotted ${points.length === 1 ? "point" : "points"}. ${xLabel} from ${formatNumber(x.start)} to ${formatNumber(x.end)}; ${yLabel} from ${formatNumber(y.start)} to ${formatNumber(y.end)}. The values are in the data table above.`}
          >
            The data table and axis scaling steps give the values shown in this
            graph.
          </canvas>
        </div>
      </div>
      <p className="hint">
        X axis: {xLabel}. Y axis: {yLabel}. Crosses mark measurements. No trend
        line has been added.
      </p>
    </section>
  );
}
