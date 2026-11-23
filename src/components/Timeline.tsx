"use client";
// Timeline de agent_events: hora, chip del agente y mensaje, con autoscroll.
// Si el usuario sube, se desfija; el botón vuelve a fijarlo al final.
import { useEffect, useRef, useState } from "react";
import type { AgentEvent, Task } from "@/lib/supabase/types";
import { AGENT_META } from "@/lib/ui/meta";
import { cn, formatTime } from "@/lib/ui/format";
import { AgentIcon, EventTypeIcon } from "./icons";

export function Timeline({ events, tasks }: { events: AgentEvent[]; tasks: Task[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = useState(true);
  const positions = new Map(tasks.map((t) => [t.id, t.position]));

  useEffect(() => {
    const el = scrollRef.current;
    if (el && pinned) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [events.length, pinned]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    if (atBottom !== pinned) setPinned(atBottom);
  };

  return (
    <section aria-label="Timeline de eventos" className="flex h-[560px] flex-col rounded-2xl border border-zinc-200 bg-white shadow-sm">
      <header className="flex items-center justify-between border-b border-zinc-100 px-4 py-3">
        <h2 className="text-sm font-semibold text-zinc-900">
          Timeline <span className="font-normal text-zinc-400">· {events.length} eventos</span>
        </h2>
        <button
          type="button"
          onClick={() => setPinned((p) => !p)}
          className={cn(
            "rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset transition",
            pinned ? "bg-sky-50 text-sky-800 ring-sky-200" : "bg-white text-zinc-600 ring-zinc-200 hover:bg-zinc-50",
          )}
          aria-pressed={pinned}
        >
          {pinned ? "Fijado al final" : "Fijar al final"}
        </button>
      </header>

      <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-y-auto px-2 py-2" aria-live="polite" aria-relevant="additions">
        {events.length === 0 && <p className="p-4 text-sm text-zinc-500">Aún no hay eventos.</p>}
        <ol className="space-y-0.5">
          {events.map((e) => {
            const meta = AGENT_META[e.agent];
            const position = e.task_id ? positions.get(e.task_id) : undefined;
            return (
              <li
                key={e.id}
                className={cn(
                  "flex animate-fade-in gap-2 rounded-lg px-2 py-1.5 text-sm",
                  e.type === "error" && "bg-red-50",
                  e.type === "result" && e.agent !== "system" && "bg-zinc-50",
                )}
              >
                <time className="mt-0.5 shrink-0 font-mono text-[11px] text-zinc-400" dateTime={e.created_at}>
                  {formatTime(e.created_at)}
                </time>
                <span className={cn("inline-flex h-5 shrink-0 items-center gap-1 rounded-full px-1.5 text-[11px] font-semibold ring-1 ring-inset", meta.chip)}>
                  <AgentIcon agent={e.agent} className="size-3" />
                  <span className="hidden sm:inline">{meta.label}</span>
                </span>
                <span
                  className={cn(
                    "mt-0.5 shrink-0",
                    e.type === "error" ? "text-red-600" : e.type === "result" ? "text-emerald-600" : "text-zinc-400",
                  )}
                >
                  <EventTypeIcon type={e.type} />
                </span>
                <p
                  className={cn(
                    "min-w-0 flex-1 break-words",
                    e.type === "action" && "text-zinc-600",
                    e.type === "thinking" && "italic text-zinc-500",
                    e.type === "status" && "text-zinc-800",
                    e.type === "result" && "font-medium text-zinc-900",
                    e.type === "error" && "font-medium text-red-800",
                  )}
                >
                  {position !== undefined && <span className="mr-1 font-mono text-[11px] text-zinc-400">#{position}</span>}
                  {e.message}
                </p>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
