// Orquestador: planifica (create_plan) y, al final, resume el run (submit_summary).
import { z } from "zod";
import { callStructured } from "../llm/structured";
import type { LLMProvider, Usage } from "../llm/types";
import type { AcceptanceCriterion, CriterionCheck, Task } from "../supabase/types";
import { headLines, normalizePath } from "../workspace";
import { MAX_TASKS } from "./limits";
import { ORCHESTRATOR_SYSTEM, SUMMARY_SYSTEM, orchestratorPrompt, summaryPrompt } from "./prompts";
import type { NewTask } from "./store";

// Esquema "plano" del check: más fácil de rellenar para modelos pequeños que
// una unión discriminada. Se convierte a CriterionCheck después.
const FlatCheck = z.object({
  type: z.enum(["file_exists", "selector_exists", "text_contains", "link_exists"]),
  path: z.string().optional().describe("file_exists, selector_exists, text_contains"),
  selector: z.string().optional().describe("selector_exists"),
  text: z.string().optional().describe("text_contains"),
  from: z.string().optional().describe("link_exists: página que contiene el enlace"),
  href: z.string().optional().describe("link_exists: destino del enlace"),
});

export const PlanSchema = z.object({
  summary: z.string().min(1),
  tasks: z
    .array(
      z.object({
        title: z.string().min(1),
        description: z.string().min(1),
        acceptance_criteria: z
          .array(
            z.object({
              id: z.string().optional(),
              description: z.string().min(1),
              check: FlatCheck.optional(),
            }),
          )
          .min(1),
      }),
    )
    .describe(`Entre 0 y ${MAX_TASKS} tareas`),
});

type FlatCheckT = z.infer<typeof FlatCheck>;

const isHtml = (path: string) => path.toLowerCase().endsWith(".html");

/** Convierte el check plano en uno tipado; si le faltan datos o la ruta no es válida, se descarta. */
export function toCriterionCheck(flat: FlatCheckT | undefined): CriterionCheck | undefined {
  if (!flat) return undefined;
  const path = (p: string | undefined) => {
    if (!p) return undefined;
    const n = normalizePath(p);
    return n.ok ? n.path : undefined;
  };
  switch (flat.type) {
    case "file_exists": {
      const p = path(flat.path);
      return p ? { type: "file_exists", path: p } : undefined;
    }
    case "selector_exists": {
      const p = path(flat.path);
      const selector = flat.selector?.trim();
      if (!p || !selector) return undefined;
      // Un selector solo tiene sentido en HTML. En CSS/JS se comprueba que el texto aparezca.
      return isHtml(p) ? { type: "selector_exists", path: p, selector } : { type: "text_contains", path: p, text: selector };
    }
    case "text_contains": {
      const p = path(flat.path);
      return p && flat.text?.trim() ? { type: "text_contains", path: p, text: flat.text.trim() } : undefined;
    }
    case "link_exists": {
      const from = path(flat.from);
      return from && isHtml(from) && flat.href?.trim() ? { type: "link_exists", from, href: flat.href.trim() } : undefined;
    }
  }
}

export type Plan = { summary: string; tasks: NewTask[] };

/** Normaliza el plan: máximo 6 tareas, ids de criterio c1…cN, checks válidos. */
export function normalizePlan(raw: z.infer<typeof PlanSchema>): Plan {
  return {
    summary: raw.summary.trim(),
    tasks: raw.tasks.slice(0, MAX_TASKS).map((t) => ({
      title: t.title.trim().slice(0, 120),
      description: t.description.trim(),
      acceptance_criteria: t.acceptance_criteria.slice(0, 8).map((c, i): AcceptanceCriterion => {
        const check = toCriterionCheck(c.check);
        return check ? { id: `c${i + 1}`, description: c.description.trim(), check } : { id: `c${i + 1}`, description: c.description.trim() };
      }),
    })),
  };
}

export async function planRun(opts: {
  llm: LLMProvider;
  request: string;
  files: ReadonlyArray<{ path: string; content: string }>;
  deadline?: number;
}): Promise<{ plan: Plan; usage?: Usage }> {
  const fileList = opts.files.map((f) => `--- ${f.path}\n${headLines(f.content, 15)}`).join("\n");
  const { data, usage } = await callStructured(opts.llm, {
    system: ORCHESTRATOR_SYSTEM,
    messages: [{ role: "user", text: orchestratorPrompt(opts.request, fileList) }],
    tool: { name: "create_plan", description: "Entrega el plan de tareas para Develop.", schema: PlanSchema },
    deadline: opts.deadline,
    meta: { agent: "orchestrator", request: opts.request, paths: opts.files.map((f) => f.path) },
  });
  return { plan: normalizePlan(data), usage };
}

const SummarySchema = z.object({ summary: z.string().min(1) });

export async function summarizeRun(opts: {
  llm: LLMProvider;
  request: string;
  tasks: Task[];
  deadline?: number;
}): Promise<{ summary: string; usage?: Usage }> {
  const lines = opts.tasks.map(
    (t) => `- ${t.title}: ${t.status === "done" ? "completada" : "fallida"} (${t.attempts} intento${t.attempts === 1 ? "" : "s"})`,
  );
  const { data, usage } = await callStructured(opts.llm, {
    system: SUMMARY_SYSTEM,
    messages: [{ role: "user", text: summaryPrompt(opts.request, lines) }],
    tool: { name: "submit_summary", description: "Entrega el resumen final para el usuario.", schema: SummarySchema },
    deadline: opts.deadline,
    meta: { agent: "summary", request: opts.request, tasks: opts.tasks.map((t) => ({ title: t.title, status: t.status })) },
  });
  return { summary: data.summary.trim(), usage };
}
