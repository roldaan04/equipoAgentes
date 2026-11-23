// Metadatos visuales compartidos: un color por agente (Orquestador violeta,
// Develop azul, Testing ámbar) usado igual en tarjetas, chips y timeline.
import type { AgentName, EventAgent, RunStatus, TaskStatus } from "@/lib/supabase/types";

type AgentMeta = {
  label: string;
  role: string;
  /** Clases Tailwind completas (Tailwind no detecta clases construidas dinámicamente). */
  chip: string;
  dot: string;
  ring: string;
  soft: string;
  text: string;
  bar: string;
};

export const AGENT_META: Record<EventAgent, AgentMeta> = {
  orchestrator: {
    label: "Orquestador",
    role: "Divide la petición en tareas con criterios de aceptación y las reparte.",
    chip: "bg-violet-100 text-violet-800 ring-violet-200",
    dot: "bg-violet-500",
    ring: "ring-violet-300",
    soft: "bg-violet-50",
    text: "text-violet-700",
    bar: "bg-violet-500",
  },
  develop: {
    label: "Develop",
    role: "Escribe y modifica los archivos de la web para cumplir cada tarea.",
    chip: "bg-blue-100 text-blue-800 ring-blue-200",
    dot: "bg-blue-500",
    ring: "ring-blue-300",
    soft: "bg-blue-50",
    text: "text-blue-700",
    bar: "bg-blue-500",
  },
  testing: {
    label: "Testing",
    role: "Comprueba el trabajo con checks automáticos y revisión, y pide cambios si algo falla.",
    chip: "bg-amber-100 text-amber-900 ring-amber-200",
    dot: "bg-amber-500",
    ring: "ring-amber-300",
    soft: "bg-amber-50",
    text: "text-amber-800",
    bar: "bg-amber-500",
  },
  system: {
    label: "Sistema",
    role: "",
    chip: "bg-zinc-100 text-zinc-700 ring-zinc-200",
    dot: "bg-zinc-400",
    ring: "ring-zinc-300",
    soft: "bg-zinc-50",
    text: "text-zinc-600",
    bar: "bg-zinc-400",
  },
};

export const AGENT_ORDER: AgentName[] = ["orchestrator", "develop", "testing"];

export const RUN_STATUS_META: Record<RunStatus, { label: string; className: string }> = {
  queued: { label: "En cola", className: "bg-zinc-100 text-zinc-700 ring-zinc-200" },
  running: { label: "En marcha", className: "bg-sky-100 text-sky-800 ring-sky-200" },
  completed: { label: "Completado", className: "bg-emerald-100 text-emerald-800 ring-emerald-200" },
  completed_with_errors: { label: "Completado con fallos", className: "bg-orange-100 text-orange-800 ring-orange-200" },
  error: { label: "Error", className: "bg-red-100 text-red-800 ring-red-200" },
};

export const TASK_COLUMNS: Array<{ status: TaskStatus; label: string; accent: string; badge: string }> = [
  { status: "pending", label: "Pendiente", accent: "border-t-zinc-300", badge: "bg-zinc-100 text-zinc-700" },
  { status: "in_progress", label: "En desarrollo", accent: "border-t-blue-500", badge: "bg-blue-100 text-blue-800" },
  { status: "testing", label: "En testing", accent: "border-t-amber-500", badge: "bg-amber-100 text-amber-900" },
  { status: "changes_requested", label: "Cambios pedidos", accent: "border-t-orange-500", badge: "bg-orange-100 text-orange-800" },
  { status: "done", label: "Completada", accent: "border-t-emerald-500", badge: "bg-emerald-100 text-emerald-800" },
  { status: "failed", label: "Fallida", accent: "border-t-red-500", badge: "bg-red-100 text-red-800" },
];

export const TASK_STATUS_LABEL = Object.fromEntries(TASK_COLUMNS.map((c) => [c.status, c.label])) as Record<TaskStatus, string>;

export const TERMINAL_STATUSES: ReadonlySet<RunStatus> = new Set(["completed", "completed_with_errors", "error"]);
