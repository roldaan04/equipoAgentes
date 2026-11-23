"use client";
// Drawer de detalle de una tarea: descripción, criterios y el historial de
// informes de Testing (checks deterministas + veredicto LLM + feedback).
import { useEffect, useRef } from "react";
import type { RunView } from "@/lib/api-types";
import { MAX_ATTEMPTS } from "@/lib/agents/limits";
import { TASK_COLUMNS } from "@/lib/ui/meta";
import { cn, formatTime } from "@/lib/ui/format";
import { CriteriaList, CriterionMark } from "./CriteriaList";
import { CrossIcon } from "./icons";
import { latestReport } from "./TaskBoard";

export function TaskDrawer({ view, taskId, onClose }: { view: RunView; taskId: string | null; onClose: () => void }) {
  const task = view.tasks.find((t) => t.id === taskId);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!task) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [task, onClose]);

  if (!task) return null;
  const column = TASK_COLUMNS.find((c) => c.status === task.status);
  const reports = view.reports.filter((r) => r.task_id === task.id).reverse();
  const last = latestReport(view.reports, task.id);
  const developEvents = view.events.filter((e) => e.task_id === task.id && e.agent === "develop" && e.type === "result");

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-labelledby="task-drawer-title">
      <button type="button" className="absolute inset-0 animate-fade-in bg-zinc-900/30 backdrop-blur-[1px]" aria-label="Cerrar" onClick={onClose} />
      <aside className="relative flex h-full w-full max-w-xl animate-slide-in flex-col bg-white shadow-2xl">
        <header className="flex items-start gap-3 border-b border-zinc-200 p-5">
          <div className="min-w-0 flex-1">
            <p className="font-mono text-xs text-zinc-400">Tarea #{task.position}</p>
            <h2 id="task-drawer-title" className="mt-0.5 text-lg font-semibold text-zinc-900">
              {task.title}
            </h2>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              <span className={cn("rounded-full px-2 py-0.5 font-semibold", column?.badge)}>{column?.label}</span>
              <span className="text-zinc-500">
                Intento {task.attempts}/{MAX_ATTEMPTS}
              </span>
            </div>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"
            aria-label="Cerrar detalle"
          >
            <CrossIcon className="size-5" />
          </button>
        </header>

        <div className="flex-1 space-y-6 overflow-y-auto p-5">
          <section>
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">Descripción</h3>
            <p className="whitespace-pre-line text-sm text-zinc-700">{task.description}</p>
          </section>

          <section>
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">Criterios de aceptación</h3>
            <CriteriaList criteria={task.acceptance_criteria} results={last?.results} />
          </section>

          {developEvents.length > 0 && (
            <section>
              <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">Entregas de Develop</h3>
              <ol className="space-y-1.5 text-sm">
                {developEvents.map((e, i) => (
                  <li key={e.id} className="rounded-lg bg-blue-50 px-3 py-2 text-blue-950">
                    <span className="mr-1.5 font-mono text-[11px] text-blue-700">
                      #{i + 1} · {formatTime(e.created_at)}
                    </span>
                    {e.message}
                  </li>
                ))}
              </ol>
            </section>
          )}

          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Informes de Testing</h3>
            {reports.length === 0 && <p className="text-sm text-zinc-500">Todavía no hay informes para esta tarea.</p>}
            <ol className="space-y-3">
              {reports.map((r) => {
                const failedChecks = r.deterministic_checks.filter((c) => !c.passed).length;
                return (
                  <li key={r.id} className={cn("rounded-xl border p-3", r.passed ? "border-emerald-200 bg-emerald-50/50" : "border-red-200 bg-red-50/40")}>
                    <div className="flex items-center justify-between gap-2">
                      <p className={cn("text-sm font-semibold", r.passed ? "text-emerald-800" : "text-red-800")}>
                        Intento {r.attempt}: {r.passed ? "aprobado" : "rechazado"}
                      </p>
                      <span className="font-mono text-[11px] text-zinc-500">{formatTime(r.created_at)}</span>
                    </div>

                    <p className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Veredicto por criterio</p>
                    <div className="mt-1">
                      <CriteriaList criteria={task.acceptance_criteria} results={r.results} showReasons />
                    </div>

                    <details className="mt-2 group">
                      <summary className="cursor-pointer text-xs font-medium text-zinc-600 hover:text-zinc-900">
                        Checks deterministas: {r.deterministic_checks.length - failedChecks}/{r.deterministic_checks.length} OK
                      </summary>
                      <ul className="mt-1.5 space-y-1 text-xs">
                        {r.deterministic_checks.map((c) => (
                          <li key={c.id} className="flex gap-1.5">
                            <CriterionMark passed={c.passed} />
                            <span className="min-w-0">
                              <span className="text-zinc-700">{c.label}</span>
                              {c.detail && <span className="block text-zinc-500">{c.detail}</span>}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </details>

                    {r.feedback && (
                      <div className="mt-2 rounded-lg bg-white/80 p-2.5 text-xs text-zinc-700 ring-1 ring-zinc-200">
                        <p className="mb-0.5 font-semibold text-amber-800">Feedback para Develop</p>
                        <p className="whitespace-pre-line">{r.feedback}</p>
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          </section>
        </div>
      </aside>
    </div>
  );
}
