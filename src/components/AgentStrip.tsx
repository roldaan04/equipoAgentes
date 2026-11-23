// Las 3 tarjetas de agente: estado (Trabajando / Esperando / Inactivo / En pausa),
// indicador animado, acción actual y último resultado.
import type { RunView } from "@/lib/api-types";
import type { AgentEvent, AgentName } from "@/lib/supabase/types";
import { AGENT_META, AGENT_ORDER, TERMINAL_STATUSES } from "@/lib/ui/meta";
import { cn, formatTime } from "@/lib/ui/format";
import { AgentIcon } from "./icons";

type AgentState = "working" | "waiting" | "idle" | "paused";

const STATE_LABEL: Record<AgentState, string> = {
  working: "Trabajando",
  waiting: "Esperando",
  idle: "Inactivo",
  paused: "En pausa",
};

function lastOf(events: AgentEvent[], agent: AgentName, types: AgentEvent["type"][]): AgentEvent | undefined {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e && e.agent === agent && types.includes(e.type)) return e;
  }
  return undefined;
}

function stats(agent: AgentName, view: RunView): string | null {
  switch (agent) {
    case "orchestrator":
      return view.tasks.length ? `${view.tasks.length} tarea${view.tasks.length === 1 ? "" : "s"} planificada${view.tasks.length === 1 ? "" : "s"}` : null;
    case "develop": {
      const writes = view.events.filter((e) => e.agent === "develop" && e.type === "action" && /^(Creando|Modificando|Borrando) /.test(e.message)).length;
      const attempts = view.tasks.reduce((n, t) => n + t.attempts, 0);
      return attempts ? `${attempts} intento${attempts === 1 ? "" : "s"} · ${writes} escritura${writes === 1 ? "" : "s"}` : null;
    }
    case "testing": {
      const ok = view.reports.filter((r) => r.passed).length;
      const ko = view.reports.length - ok;
      return view.reports.length ? `${ok} aprobada${ok === 1 ? "" : "s"} · ${ko} rechazo${ko === 1 ? "" : "s"}` : null;
    }
  }
}

export function AgentStrip({ view, paused }: { view: RunView; paused: boolean }) {
  const { run, events } = view;
  const terminal = TERMINAL_STATUSES.has(run.status);

  return (
    <section aria-label="Agentes" className="grid grid-cols-1 gap-3 md:grid-cols-3">
      {AGENT_ORDER.map((agent) => {
        const meta = AGENT_META[agent];
        const isCurrent = !terminal && run.current_agent === agent;
        const state: AgentState = terminal ? "idle" : isCurrent ? (paused ? "paused" : "working") : "waiting";
        const lastStatus = lastOf(events, agent, ["status"]);
        const lastResult = lastOf(events, agent, ["result"]);
        const lastAction = lastOf(events, agent, ["action", "thinking"]);
        const action = isCurrent
          ? (lastAction && lastStatus && lastAction.id > lastStatus.id ? lastAction.message : run.current_action) ?? lastStatus?.message
          : null;
        const line = stats(agent, view);

        return (
          <article
            key={agent}
            className={cn(
              "relative overflow-hidden rounded-2xl border bg-white p-4 shadow-sm transition-all duration-300",
              state === "working" ? cn("border-transparent ring-2", meta.ring, "shadow-md") : "border-zinc-200",
            )}
          >
            {state === "working" && <div className={cn("absolute inset-x-0 top-0 h-1 animate-pulse", meta.bar)} aria-hidden />}
            <header className="flex items-start gap-3">
              <div className={cn("grid size-10 shrink-0 place-items-center rounded-xl", meta.soft, meta.text)}>
                <AgentIcon agent={agent} className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-semibold text-zinc-900">{meta.label}</h3>
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
                      state === "working" && cn(meta.soft, meta.text),
                      state === "waiting" && "bg-zinc-100 text-zinc-600",
                      state === "idle" && "bg-zinc-100 text-zinc-500",
                      state === "paused" && "bg-yellow-100 text-yellow-900",
                    )}
                  >
                    <span
                      className={cn(
                        "size-1.5 rounded-full",
                        state === "working" ? cn(meta.dot, "animate-working") : state === "paused" ? "bg-yellow-500" : "bg-zinc-400",
                      )}
                      aria-hidden
                    />
                    {STATE_LABEL[state]}
                  </span>
                </div>
                <p className="text-xs text-zinc-500">{meta.role}</p>
              </div>
            </header>

            <dl className="mt-3 space-y-2 text-sm">
              <div>
                <dt className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">Ahora</dt>
                <dd className={cn("mt-0.5 line-clamp-2 min-h-10", action ? "text-zinc-800" : "text-zinc-400")} aria-live="polite">
                  {action ?? (terminal ? "Ha terminado su trabajo." : state === "waiting" ? "Esperando su turno." : "—")}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">Último resultado</dt>
                <dd className={cn("mt-0.5 line-clamp-2 min-h-10", lastResult ? "text-zinc-700" : "text-zinc-400")}>
                  {lastResult ? (
                    <>
                      <span className="mr-1 font-mono text-[11px] text-zinc-400">{formatTime(lastResult.created_at)}</span>
                      {lastResult.message}
                    </>
                  ) : (
                    "Todavía nada."
                  )}
                </dd>
              </div>
            </dl>
            {line && <p className={cn("mt-3 border-t border-zinc-100 pt-2 text-xs font-medium", meta.text)}>{line}</p>}
          </article>
        );
      })}
    </section>
  );
}
