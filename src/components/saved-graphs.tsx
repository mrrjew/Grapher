"use client";

import { useEffect, useRef, useState } from "react";
import {
  emptyDraft,
  readDraft,
  validateGraph,
  type GraphDraft,
} from "@/lib/graph-input";
import { savedGraphKey } from "@/lib/graph-draft";

type Saved = { id: string; title: string; created_at: string };
type List = { graphs: Saved[]; paid: boolean; nextOffset: number | null };
async function call(url: string, options?: RequestInit) {
  const response = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(20000),
    cache: "no-store",
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(
      data.message || "This request could not be completed. Please try again.",
    );
  return data;
}

export function SavedGraphs({
  userId,
  draft,
  onLoad,
}: {
  userId: string;
  draft: GraphDraft;
  onLoad: (draft: GraphDraft) => void;
}) {
  const [graphs, setGraphs] = useState<Saved[]>([]);
  const [paid, setPaid] = useState(false);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const currentId = useRef<string | null>(null);
  const currentDraft = useRef(draft);
  currentDraft.current = draft;
  const mounted = useRef(true);

  function select(id: string | null) {
    currentId.current = id;
    try {
      if (id) localStorage.setItem(savedGraphKey(userId), id);
      else localStorage.removeItem(savedGraphKey(userId));
    } catch {
      /* In-memory retry identity still works when storage is blocked. */
    }
  }
  async function refresh(offset = 0) {
    const data: List = await call(`/api/graphs?offset=${offset}`);
    if (!mounted.current) return;
    setGraphs((previous) =>
      offset === 0
        ? data.graphs
        : [
            ...previous,
            ...data.graphs.filter(
              (item) => !previous.some((old) => old.id === item.id),
            ),
          ],
    );
    setPaid(data.paid);
    setNextOffset(data.nextOffset);
    setReady(true);
  }
  useEffect(() => {
    mounted.current = true;
    try {
      const id = localStorage.getItem(savedGraphKey(userId));
      if (id && /^[0-9a-f-]{36}$/i.test(id)) currentId.current = id;
    } catch {
      /* Draft warning explains unavailable storage. */
    }
    refresh().catch(() => {
      if (mounted.current) {
        setFailed(true);
        setMessage(
          "Saved graphs could not be opened. Your current table is still here. Use Refresh saved graphs to try again.",
        );
      }
    });
    function selectionChanged(event: StorageEvent) {
      if (event.key === savedGraphKey(userId)) {
        try {
          currentId.current = localStorage.getItem(savedGraphKey(userId));
        } catch {
          currentId.current = null;
        }
      }
    }
    window.addEventListener("storage", selectionChanged);
    return () => {
      mounted.current = false;
      window.removeEventListener("storage", selectionChanged);
    };
  }, [userId]); // Account changes remount this component in the protected workspace.

  async function action(operation: () => Promise<void>) {
    setBusy(true);
    setFailed(false);
    setMessage("");
    try {
      await operation();
    } catch (error) {
      if (mounted.current) {
        setFailed(true);
        setMessage(
          error instanceof Error &&
            error.name !== "TimeoutError" &&
            error.name !== "TypeError"
            ? error.message
            : "The request took too long or the connection failed. Your table is still here. Retry to check or save it again.",
        );
      }
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  async function save() {
    const validation = validateGraph(draft);
    if (validation.errors.length) {
      setFailed(true);
      setMessage(validation.errors[0].message);
      return;
    }
    await action(async () => {
      let id = currentId.current;
      if (!id && !paid && graphs.length) {
        if (
          !window.confirm(
            "Replace your one saved graph with the current table?",
          )
        )
          return;
        id = graphs[0].id;
      }
      if (!id) id = crypto.randomUUID();
      select(id); // Persist before the request: timeout/retry never creates another graph.
      const snapshot = JSON.stringify(draft);
      await call("/api/graphs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, draft }),
      });
      setMessage(
        snapshot === JSON.stringify(currentDraft.current)
          ? "Graph saved."
          : "Graph saved. Your newer table edits still need saving.",
      );
      try {
        await refresh();
      } catch {
        setMessage(
          "Graph saved. The saved list could not refresh. Your table is still here.",
        );
      }
    });
  }
  async function load(id: string) {
    if (!window.confirm("Load this saved graph and replace the current table?"))
      return;
    await action(async () => {
      const beforeLoad = JSON.stringify(currentDraft.current);
      const data = await call(`/api/graphs/${id}`);
      const loaded = readDraft(JSON.stringify(data.draft));
      if (
        beforeLoad !== JSON.stringify(currentDraft.current) &&
        !window.confirm(
          "Your table changed while this graph was loading. Replace those newer edits?",
        )
      ) {
        setMessage("Your newer table edits were kept.");
        return;
      }
      select(id);
      onLoad(loaded);
      setMessage("Graph loaded.");
    });
  }
  async function remove(id: string) {
    if (
      !window.confirm(
        "Delete this saved graph? Your current table will stay here.",
      )
    )
      return;
    await action(async () => {
      await call(`/api/graphs/${id}`, { method: "DELETE" });
      if (currentId.current === id) select(null);
      await refresh();
      setMessage("Saved graph deleted. Your current table is still here.");
    });
  }
  return (
    <section
      className="saved-graphs"
      aria-labelledby="saved-title"
      aria-busy={busy}
    >
      <div className="saved-heading">
        <div>
          <h3 id="saved-title">Saved graphs</h3>
          <p className="hint">
            {paid
              ? "Your semester pass allows unlimited saved graphs."
              : "Your free account can keep one saved graph. You can update it whenever you need."}
          </p>
        </div>
        <div className="graph-actions">
          <button
            type="button"
            className="button"
            onClick={save}
            disabled={busy || !ready}
          >
            Save graph
          </button>
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={() => {
              if (
                window.confirm(
                  "Start a new graph and replace this browser’s draft? Saved graphs will stay online.",
                )
              ) {
                select(null);
                onLoad(emptyDraft());
                setMessage("New graph started.");
              }
            }}
          >
            New graph
          </button>
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={() => action(() => refresh())}
          >
            Refresh saved graphs
          </button>
        </div>
      </div>
      {message && (
        <p
          className={`message ${failed ? "error-message" : ""}`}
          role={failed ? "alert" : "status"}
        >
          {message}
        </p>
      )}
      {graphs.length ? (
        <ul className="saved-list">
          {graphs.map((graph) => (
            <li key={graph.id}>
              <span>{graph.title}</span>
              <div>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => load(graph.id)}
                  disabled={busy}
                >
                  Load<span className="visually-hidden"> {graph.title}</span>
                </button>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => remove(graph.id)}
                  disabled={busy}
                >
                  Delete<span className="visually-hidden"> {graph.title}</span>
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        ready && <p className="hint">No saved graphs yet.</p>
      )}
      {nextOffset !== null && (
        <button
          className="button secondary"
          type="button"
          disabled={busy}
          onClick={() => action(() => refresh(nextOffset))}
        >
          Show more saved graphs
        </button>
      )}
      {!paid && (
        <p className="hint">
          <a href="/upgrade">View the semester pass</a> for more saved graphs
          and the full report guide.
        </p>
      )}
    </section>
  );
}
