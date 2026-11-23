"use client";
// Panel del run: cabecera, 3 agentes, kanban, timeline, archivos/vista previa,
// resumen final y errores visibles. Estado en vivo + driver de pasos.
import Link from "next/link";
import { useCallback, useState } from "react";
import { useRunDriver } from "@/hooks/useRunDriver";
import { useRunRealtime } from "@/hooks/useRunRealtime";
import type { RunView } from "@/lib/api-types";
import { TERMINAL_STATUSES } from "@/lib/ui/meta";
import { AgentStrip } from "./AgentStrip";
import { ErrorBanner } from "./ErrorBanner";
import { OrchestratorIcon } from "./icons";
import { RunHeader } from "./RunHeader";
import { TaskBoard } from "./TaskBoard";
import { TaskDrawer } from "./TaskDrawer";
import { Timeline } from "./Timeline";
import { WorkspacePanel } from "./WorkspacePanel";

/** ¿Se quedó el run en pausa por falta de LLM? (último evento = error de sistema con motivo). */
function pausedByLLM(view: RunView | null): boolean {
  if (!view || TERMINAL_STATUSES.has(view.run.status)) return false;
  const last = view.events.at(-1);
  const payload = last?.payload;
  return (
    last?.agent === "system" &&
    last.type === "error" &&
    payload !== null &&
    typeof payload === "object" &&
    !Array.isArray(payload) &&
    (payload.reason === "quota" || payload.reason === "overloaded")
  );
}

export function RunPanel({ runId }: { runId: string }) {
  const live = useRunRealtime(runId);
  const { view, refresh } = live;
  const terminal = view ? TERMINAL_STATUSES.has(view.run.status) : false;
  const [openTask, setOpenTask] = useState<string | null>(null);

  const onStep = useCallback(() => refresh(150), [refresh]);
  const driver = useRunDriver(runId, {
    terminal,
    // No se da el primer paso hasta tener la conexión en vivo (Realtime o polling):
    // así no se pierden los eventos del primer paso mientras se une el canal.
    ready: view !== null && live.mode !== "connecting",
    startPaused: pausedByLLM(view), // solo se lee al cargar
    onStep,
  });
  const closeDrawer = useCallback(() => setOpenTask(null), []);

  if (live.notFound) {
    return (
      <div className="mx-auto max-w-xl py-16">
        <ErrorBanner title="Run no encontrado" action={<Link href="/" className="font-medium underline">Volver al inicio</Link>}>
          No existe ningún run con este identificador. Puede que el enlace esté mal copiado.
        </ErrorBanner>
      </div>
    );
  }

  if (!view) {
    return live.error ? (
      <div className="mx-auto max-w-xl py-16">
        <ErrorBanner title="No se pudo cargar el run">{live.error}</ErrorBanner>
      </div>
    ) : (
      <PanelSkeleton />
    );
  }

  const done = view.tasks.filter((t) => t.status === "done").length;

  return (
    <div className="space-y-4">
      <RunHeader
        view={view}
        driverMode={driver.mode}
        stepping={driver.stepping}
        liveMode={live.mode}
        onPause={driver.pause}
        onResume={driver.resume}
      />

      {view.run.status === "error" && (
        <ErrorBanner title="El run ha terminado con un error">
          {[...view.events].reverse().find((e) => e.type === "error")?.message ?? "Error no recuperable."} Puedes lanzar un run nuevo desde el inicio.
        </ErrorBanner>
      )}
      {driver.notice?.kind === "quota" && driver.mode === "paused" && (
        <ErrorBanner
          kind="warning"
          title="En pausa: el LLM no está disponible ahora mismo"
          action={
            <button type="button" onClick={driver.resume} className="rounded-lg bg-yellow-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-yellow-800">
              Reanudar
            </button>
          }
        >
          {driver.notice.message}
        </ErrorBanner>
      )}
      {driver.notice?.kind === "warning" && <ErrorBanner kind="warning" title="Problema de conexión">{driver.notice.message}</ErrorBanner>}
      {live.error && <ErrorBanner kind="warning" title="Sin actualizaciones">{live.error}</ErrorBanner>}

      {terminal && view.run.final_summary && view.run.status !== "error" && (
        <section className="animate-pop-in rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 to-white p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-violet-100 text-violet-700">
              <OrchestratorIcon />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-violet-900">Resumen final del Orquestador</h2>
              <p className="mt-1 text-sm leading-relaxed text-zinc-800">{view.run.final_summary}</p>
            </div>
          </div>
        </section>
      )}

      <AgentStrip view={view} paused={driver.mode === "paused"} />

      <div>
        <h2 className="mb-2 text-sm font-semibold text-zinc-900">Tareas</h2>
        <TaskBoard view={view} onOpenTask={setOpenTask} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div className="min-w-0 lg:col-span-2">
          <Timeline events={view.events} tasks={view.tasks} />
        </div>
        <div className="min-w-0 lg:col-span-3">
          <WorkspacePanel runId={runId} files={view.files} doneCount={done} terminal={terminal} />
        </div>
      </div>

      <TaskDrawer view={view} taskId={openTask} onClose={closeDrawer} />
    </div>
  );
}

export function PanelSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Cargando el run">
      <div className="h-36 animate-pulse rounded-2xl bg-zinc-200/70" />
      <div className="grid gap-3 md:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-44 animate-pulse rounded-2xl bg-zinc-200/70" />
        ))}
      </div>
      <div className="h-56 animate-pulse rounded-2xl bg-zinc-200/70" />
    </div>
  );
}
