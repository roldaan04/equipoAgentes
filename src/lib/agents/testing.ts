// Testing en dos capas: checks deterministas (sin LLM) + revisión con LLM.
// Regla: passed final = LLM passed Y todos los checks deterministas OK.
import { z } from "zod";
import { callStructured } from "../llm/structured";
import type { LLMProvider, Usage } from "../llm/types";
import type { CriterionResult, DeterministicCheckResult, Task } from "../supabase/types";
import { runDeterministicChecks, toFileMap } from "./checks";
import { TESTING_SYSTEM, testingPrompt } from "./prompts";
import { filesBlock } from "./tools";

export const ReportSchema = z.object({
  passed: z.boolean(),
  results: z.array(z.object({ criterion_id: z.string(), passed: z.boolean(), reason: z.string() })),
  feedback_for_develop: z.string(),
});

export type TestingResult = {
  passed: boolean;
  deterministic: DeterministicCheckResult[];
  results: CriterionResult[];
  feedback: string;
  usage?: Usage;
};

/** Combina el veredicto del LLM con los checks deterministas (puro, testeable). */
export function combineVerdict(
  task: Pick<Task, "acceptance_criteria">,
  deterministic: DeterministicCheckResult[],
  llm: z.infer<typeof ReportSchema>,
): { passed: boolean; results: CriterionResult[]; feedback: string } {
  const failedChecks = deterministic.filter((c) => !c.passed);
  const failedIds = new Set(failedChecks.map((c) => c.id));
  const byId = new Map(llm.results.map((r) => [r.criterion_id.trim(), r]));

  const results = task.acceptance_criteria.map((c): CriterionResult => {
    const r = byId.get(c.id);
    if (failedIds.has(c.id)) {
      const check = failedChecks.find((f) => f.id === c.id);
      return { criterion_id: c.id, passed: false, reason: `Check determinista fallido: ${check?.detail ?? check?.label ?? ""}`.trim() };
    }
    if (!r) return { criterion_id: c.id, passed: llm.passed, reason: "Sin evaluación explícita del LLM; se usa su veredicto global." };
    return { criterion_id: c.id, passed: r.passed, reason: r.reason };
  });

  const passed = llm.passed && failedChecks.length === 0 && results.every((r) => r.passed);
  let feedback = llm.feedback_for_develop.trim();
  if (failedChecks.length > 0) {
    const detail = failedChecks.map((c) => `- ${c.label}${c.detail ? `: ${c.detail}` : ""}`).join("\n");
    feedback = `Checks deterministas fallidos:\n${detail}${feedback ? `\n\n${feedback}` : ""}`;
  }
  return { passed, results, feedback: feedback || (passed ? "Todo correcto." : "La tarea no cumple los criterios.") };
}

export async function runTesting(opts: {
  llm: LLMProvider;
  task: Pick<Task, "title" | "description" | "acceptance_criteria">;
  attempt: number;
  developSummary: string | null;
  files: ReadonlyArray<{ path: string; content: string; updated_by: string | null }>;
  deadline?: number;
}): Promise<TestingResult> {
  const { results: deterministic } = runDeterministicChecks(opts.task.acceptance_criteria, toFileMap(opts.files));
  const changed = opts.files.filter((f) => f.updated_by === "develop");

  const { data, usage } = await callStructured(opts.llm, {
    system: TESTING_SYSTEM,
    messages: [
      {
        role: "user",
        text: testingPrompt({
          task: opts.task,
          attempt: opts.attempt,
          developSummary: opts.developSummary,
          checks: deterministic,
          filesBlock: filesBlock(changed),
        }),
      },
    ],
    tool: { name: "submit_report", description: "Entrega el informe de testing.", schema: ReportSchema },
    deadline: opts.deadline,
    meta: { agent: "testing", task: opts.task, attempt: opts.attempt, deterministic },
  });

  return { ...combineVerdict(opts.task, deterministic, data), deterministic, usage };
}
