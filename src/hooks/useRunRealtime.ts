"use client";
// Estado en vivo de un run: carga inicial con GET /api/runs/[id] y suscripción
// Realtime a runs, tasks, agent_events y test_reports. Si Realtime no conecta en
// 5 s (o se cae), pasa a polling cada 2 s. Con Realtime activo se resincroniza
// igualmente cada 15 s por si se perdió algún evento.
import { useCallback, useEffect, useReducer, useRef } from "react";
import type { RunView } from "@/lib/api-types";
import { getBrowserClient } from "@/lib/supabase/browser";
import type { AgentEvent, Run, Task, TestReport } from "@/lib/supabase/types";
import { TERMINAL_STATUSES } from "@/lib/ui/meta";

export type LiveMode = "connecting" | "realtime" | "polling";

type State = { view: RunView | null; error: string | null; notFound: boolean; mode: LiveMode };

type Action =
  | { type: "snapshot"; view: RunView }
  | { type: "run"; run: Run }
  | { type: "task"; task: Task }
  | { type: "event"; event: AgentEvent }
  | { type: "report"; report: TestReport }
  | { type: "error"; error: string | null }
  | { type: "notFound" }
  | { type: "mode"; mode: LiveMode };

function upsertById<T extends { id: string | number }>(list: T[], item: T, sort?: (a: T, b: T) => number): T[] {
  const i = list.findIndex((x) => x.id === item.id);
  const next = i >= 0 ? list.map((x, j) => (j === i ? item : x)) : [...list, item];
  return sort ? next.sort(sort) : next;
}

function mergeById<T extends { id: string | number }>(a: T[], b: T[], sort: (x: T, y: T) => number): T[] {
  const map = new Map<string | number, T>();
  for (const x of a) map.set(x.id, x);
  for (const x of b) map.set(x.id, x);
  return [...map.values()].sort(sort);
}

const byEventId = (a: AgentEvent, b: AgentEvent) => a.id - b.id;
const byPosition = (a: Task, b: Task) => a.position - b.position;
const byCreated = (a: TestReport, b: TestReport) => a.created_at.localeCompare(b.created_at);

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "snapshot": {
      // El snapshot manda, pero se conservan los eventos/informes que hayan llegado por Realtime.
      const prev = state.view;
      const view = prev
        ? {
            ...action.view,
            events: mergeById(prev.events, action.view.events, byEventId),
            reports: mergeById(prev.reports, action.view.reports, byCreated),
          }
        : action.view;
      return { ...state, view, error: null, notFound: false };
    }
    case "run":
      return state.view ? { ...state, view: { ...state.view, run: { ...state.view.run, ...action.run } } } : state;
    case "task":
      return state.view ? { ...state, view: { ...state.view, tasks: upsertById(state.view.tasks, action.task, byPosition) } } : state;
    case "event":
      return state.view ? { ...state, view: { ...state.view, events: upsertById(state.view.events, action.event, byEventId) } } : state;
    case "report":
      return state.view ? { ...state, view: { ...state.view, reports: upsertById(state.view.reports, action.report, byCreated) } } : state;
    case "error":
      return { ...state, error: action.error };
    case "notFound":
      return { ...state, notFound: true };
    case "mode":
      return { ...state, mode: action.mode };
  }
}

const POLL_MS = 2000;
const RESYNC_MS = 15000;
const CONNECT_TIMEOUT_MS = 5000;

export function useRunRealtime(runId: string) {
  const [state, dispatch] = useReducer(reducer, { view: null, error: null, notFound: false, mode: "connecting" });
  const terminalRef = useRef(false);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchView = useCallback(async () => {
    try {
      const res = await fetch(`/api/runs/${runId}`, { cache: "no-store" });
      if (res.status === 404) return dispatch({ type: "notFound" });
      const body: unknown = await res.json();
      if (!res.ok) {
        const message = (body as { error?: string }).error ?? `Error ${res.status}`;
        return dispatch({ type: "error", error: message });
      }
      const view = body as RunView;
      terminalRef.current = TERMINAL_STATUSES.has(view.run.status);
      dispatch({ type: "snapshot", view });
    } catch {
      dispatch({ type: "error", error: "No se puede conectar con el servidor. Comprueba tu conexión; se reintentará automáticamente." });
    }
  }, [runId]);

  /** Refresco con debounce (p. ej. para la lista de archivos, que no va por Realtime). */
  const refresh = useCallback(
    (delay = 500) => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(() => void fetchView(), delay);
    },
    [fetchView],
  );

  useEffect(() => {
    let disposed = false;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    const supabase = getBrowserClient();

    const startPolling = () => {
      if (pollTimer || disposed) return;
      dispatch({ type: "mode", mode: "polling" });
      pollTimer = setInterval(() => {
        if (!terminalRef.current) void fetchView();
      }, POLL_MS);
    };

    void fetchView();

    const channel = supabase
      .channel(`run-${runId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "runs", filter: `id=eq.${runId}` }, (p) => {
        if (p.eventType === "DELETE") return;
        const run = p.new as Run;
        const wasTerminal = terminalRef.current;
        terminalRef.current = TERMINAL_STATUSES.has(run.status);
        dispatch({ type: "run", run });
        if (terminalRef.current && !wasTerminal) refresh(800); // último snapshot completo
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks", filter: `run_id=eq.${runId}` }, (p) => {
        if (p.eventType !== "DELETE") dispatch({ type: "task", task: p.new as Task });
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "agent_events", filter: `run_id=eq.${runId}` }, (p) => {
        const event = p.new as AgentEvent;
        dispatch({ type: "event", event });
        if (event.agent === "develop" && (event.type === "action" || event.type === "result")) refresh();
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "test_reports", filter: `run_id=eq.${runId}` }, (p) => {
        dispatch({ type: "report", report: p.new as TestReport });
      })
      .subscribe((status) => {
        if (disposed) return;
        if (status === "SUBSCRIBED") {
          if (pollTimer) {
            clearInterval(pollTimer);
            pollTimer = null;
          }
          dispatch({ type: "mode", mode: "realtime" });
          // Por si algo cambió entre la carga y la suscripción (con margen: el
          // filtro del servidor puede tardar un instante en engancharse).
          refresh(1000);
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          startPolling();
        }
      });

    const connectTimeout = setTimeout(() => {
      if (channel.state !== "joined") startPolling();
    }, CONNECT_TIMEOUT_MS);

    const resync = setInterval(() => {
      if (!terminalRef.current) void fetchView();
    }, RESYNC_MS);

    return () => {
      disposed = true;
      clearTimeout(connectTimeout);
      clearInterval(resync);
      if (pollTimer) clearInterval(pollTimer);
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      void supabase.removeChannel(channel);
    };
  }, [runId, fetchView, refresh]);

  return { ...state, refresh };
}
