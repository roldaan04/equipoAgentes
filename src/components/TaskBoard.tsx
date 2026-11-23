// Kanban: Pendiente · En desarrollo · En testing · Cambios pedidos · Completada · Fallida.
// Cada tarjeta se monta de nuevo al cambiar de columna, así que se anima al llegar.
import type { RunView } from "@/lib/api-types";
import type { Task, TestReport } from "@/lib/supabase/types";
import { MAX_ATTEMPTS } from "@/lib/agents/limits";
import { TASK_COLUMNS } from "@/lib/ui/meta";
import { cn } from "@/lib/ui/format";
import { CriteriaList } from "./CriteriaList";

export function latestReport(reports: TestReport[], taskId: string): TestReport | undefined {
  for (let i = reports.length - 1; i >= 0; i--) {
    const r = reports[i];
    if (r?.task_id === taskId) return r;
  }
  return undefined;
}

function AttemptDots({ attempts, status }: { attempts: number; status: Task["status"] }) {
  return (
    <span className="flex items-center gap-1" title={`Intento ${attempts} de ${MAX_ATTEMPTS}`}>
      {Array.from({ length: MAX_ATTEMPTS }, (_, i) => (
        <span
          key={i}
          className={cn(
            "size-1.5 rounded-full",
            i < attempts ? (status === "failed" ? "bg-red-500" : status === "done" ? "bg-emerald-500" : "bg-blue-500") : "bg-zinc-200",
          )}
        />
      ))}
      <span className="ml-0.5 font-mono text-[11px] text-zinc-500">
        {attempts}/{MAX_ATTEMPTS}
      </span>
    </span>
  );
}

function TaskCard({ task, report, onOpen }: { task: Task; report?: TestReport; onOpen: () => void }) {
  const active = task.status === "in_progress" || task.status === "testing";
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "w-full animate-pop-in rounded-xl border bg-white p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500",
        active ? (task.status === "in_progress" ? "border-blue-300 ring-1 ring-blue-200" : "border-amber-300 ring-1 ring-amber-200") : "border-zinc-200",
      )}
    >
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="font-mono text-[11px] font-semibold text-zinc-400">#{task.position}</span>
        {active && (
          <span className={cn("size-2 animate-working rounded-full", task.status === "in_progress" ? "bg-blue-500" : "bg-amber-500")} aria-hidden />
        )}
      </div>
      <p className="text-sm font-semibold leading-snug text-zinc-900">{task.title}</p>
      <div className="mt-2">
        <CriteriaList criteria={task.acceptance_criteria} results={report?.results} compact />
      </div>
      <div className="mt-2.5 flex items-center justify-between border-t border-zinc-100 pt-2">
        <AttemptDots attempts={task.attempts} status={task.status} />
        <span className="text-[11px] font-medium text-sky-700">Ver detalle</span>
      </div>
    </button>
  );
}

export function TaskBoard({ view, onOpenTask }: { view: RunView; onOpenTask: (taskId: string) => void }) {
  const { tasks, reports, run } = view;

  if (tasks.length === 0) {
    const planning = run.status === "queued" || run.status === "running";
    return (
      <section aria-label="Tareas" className="rounded-2xl border border-dashed border-zinc-300 bg-white/60 p-8 text-center">
        {planning ? (
          <>
            <div className="mx-auto mb-3 flex w-fit gap-1.5" aria-hidden>
              {[0, 1, 2].map((i) => (
                <span key={i} className="size-2 animate-working rounded-full bg-violet-500" style={{ animationDelay: `${i * 0.2}s` }} />
              ))}
            </div>
            <p className="font-medium text-zinc-700">El Orquestador está preparando el plan…</p>
            <p className="mt-1 text-sm text-zinc-500">Las tareas aparecerán aquí con sus criterios de aceptación.</p>
          </>
        ) : (
          <p className="text-sm text-zinc-600">Este run no generó tareas{run.final_summary ? `: ${run.final_summary}` : "."}</p>
        )}
      </section>
    );
  }

  return (
    <section aria-label="Tareas">
      {/* Móvil: lista vertical con solo las columnas que tienen tareas. */}
      <div className="space-y-3 md:hidden">
        {TASK_COLUMNS.map((col) => {
          const items = tasks.filter((t) => t.status === col.status);
          if (items.length === 0) return null;
          return (
            <div key={col.status} className={cn("rounded-2xl border-t-4 bg-zinc-100/80 p-2.5", col.accent)}>
              <h3 className="mb-2 flex items-center justify-between px-1 text-xs font-semibold uppercase tracking-wide text-zinc-600">
                {col.label}
                <span className={cn("rounded-full px-2 py-0.5 text-[11px]", col.badge)}>{items.length}</span>
              </h3>
              <div className="flex flex-col gap-2">
                {items.map((task) => (
                  <TaskCard key={`${task.id}:${task.status}`} task={task} report={latestReport(reports, task.id)} onOpen={() => onOpenTask(task.id)} />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Escritorio: kanban de 6 columnas (scroll horizontal si no cabe). */}
      <div className="hidden overflow-x-auto pb-2 md:block">
      <div className="grid min-w-[1080px] grid-cols-6 gap-3">
        {TASK_COLUMNS.map((col) => {
          const items = tasks.filter((t) => t.status === col.status);
          return (
            <div key={col.status} className={cn("flex min-h-40 flex-col rounded-2xl border-t-4 bg-zinc-100/80 p-2.5", col.accent)}>
              <h3 className="mb-2 flex items-center justify-between px-1 text-xs font-semibold uppercase tracking-wide text-zinc-600">
                {col.label}
                <span className={cn("rounded-full px-2 py-0.5 text-[11px]", col.badge)}>{items.length}</span>
              </h3>
              <div className="flex flex-1 flex-col gap-2">
                {items.map((task) => (
                  <TaskCard key={`${task.id}:${task.status}`} task={task} report={latestReport(reports, task.id)} onOpen={() => onOpenTask(task.id)} />
                ))}
                {items.length === 0 && <div className="flex-1 rounded-xl border border-dashed border-zinc-300/80" aria-hidden />}
              </div>
            </div>
          );
        })}
      </div>
      </div>
    </section>
  );
}
