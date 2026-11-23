import Link from "next/link";
import type { RunView } from "@/lib/api-types";
import type { DriverMode } from "@/hooks/useRunDriver";
import type { LiveMode } from "@/hooks/useRunRealtime";
import { cn, formatDate } from "@/lib/ui/format";
import { PauseIcon, PlayIcon } from "./icons";
import { StatusBadge } from "./StatusBadge";

export function RunHeader({
  view,
  driverMode,
  stepping,
  liveMode,
  onPause,
  onResume,
}: {
  view: RunView;
  driverMode: DriverMode;
  stepping: boolean;
  liveMode: LiveMode;
  onPause: () => void;
  onResume: () => void;
}) {
  const { run, tasks } = view;
  const done = tasks.filter((t) => t.status === "done").length;
  const failed = tasks.filter((t) => t.status === "failed").length;
  const total = tasks.length;
  const model = [...view.events].reverse().find((e) => e.payload && typeof e.payload === "object" && !Array.isArray(e.payload) && "model" in e.payload)
    ?.payload as { model?: string } | undefined;

  return (
    <header className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
        <Link href="/" className="font-medium text-sky-700 hover:underline">
          ← Inicio
        </Link>
        <span aria-hidden>·</span>
        <span>Creado {formatDate(run.created_at)}</span>
        {model?.model && (
          <>
            <span aria-hidden>·</span>
            <span className="font-mono">{model.model}</span>
          </>
        )}
        <span aria-hidden>·</span>
        <span className="inline-flex items-center gap-1" title={liveMode === "realtime" ? "Actualizaciones en tiempo real (Supabase Realtime)" : "Realtime no disponible: se actualiza cada 2 s"}>
          <span className={cn("size-1.5 rounded-full", liveMode === "realtime" ? "bg-emerald-500" : liveMode === "polling" ? "bg-amber-500" : "bg-zinc-300")} />
          {liveMode === "realtime" ? "En directo" : liveMode === "polling" ? "Actualizando cada 2 s" : "Conectando…"}
        </span>
      </div>

      <div className="mt-3 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Petición</p>
          <h1 className="mt-0.5 text-xl font-semibold leading-snug text-zinc-900">{run.request}</h1>
          {run.plan_summary && <p className="mt-1.5 text-sm text-zinc-600">{run.plan_summary}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <StatusBadge status={run.status} paused={driverMode === "paused"} />
          {driverMode === "running" && (
            <button
              type="button"
              onClick={onPause}
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            >
              <PauseIcon /> Pausar
            </button>
          )}
          {driverMode === "paused" && (
            <button
              type="button"
              onClick={onResume}
              className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700"
            >
              <PlayIcon /> Reanudar
            </button>
          )}
        </div>
      </div>

      <div className="mt-4">
        <div className="mb-1.5 flex items-center justify-between text-xs text-zinc-600">
          <span>
            {total === 0 ? "Sin tareas todavía" : `${done} de ${total} tareas completadas`}
            {failed > 0 && <span className="ml-1 text-red-700">· {failed} fallida{failed === 1 ? "" : "s"}</span>}
          </span>
          {stepping && driverMode === "running" && <span className="text-zinc-400">Ejecutando paso…</span>}
        </div>
        <div className="flex h-2 overflow-hidden rounded-full bg-zinc-100" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} aria-label="Progreso de tareas">
          <div className="bg-emerald-500 transition-all duration-500" style={{ width: total ? `${(done / total) * 100}%` : "0%" }} />
          <div className="bg-red-400 transition-all duration-500" style={{ width: total ? `${(failed / total) * 100}%` : "0%" }} />
        </div>
      </div>
    </header>
  );
}
