// Máquina de estados del run. advanceRun() ejecuta UNA acción de un agente y
// vuelve; el navegador (o la CLI) lo llama en bucle. Solo el engine escribe.
//
//  queued ──Orquestador planifica──► running
//  running: primera tarea que no esté done/failed
//    pending | changes_requested | in_progress → Develop (un intento) → testing
//    testing → Testing: OK → done · fallo → changes_requested | failed (3 intentos)
//    sin tareas pendientes → Orquestador resume → completed | completed_with_errors
//  Excepción no recuperable → error.  LLM sin cuota/saturado → pausa reanudable.
import { InvalidOutputError } from "../llm/structured";
import { LLMUnavailableError, type LLMProvider, type Usage } from "../llm/types";
import type { AgentName, Json, Run, RunStatus, Task } from "../supabase/types";
import { runDevelop } from "./develop";
import { LOCK_SECONDS, MAX_ATTEMPTS, STEP_BUDGET_MS } from "./limits";
import { planRun, summarizeRun } from "./orchestrator";
import type { RunStore } from "./store";
import { runTesting, type TestingResult } from "./testing";
import type { Workspace } from "./tools";
import { runDeterministicChecks, toFileMap } from "./checks";

export type EngineDeps = {
  store: RunStore;
  llm: LLMProvider;
  now?: () => number;
  stepBudgetMs?: number;
};

export type StepResult = {
  status: RunStatus;
  done: boolean;
  /** El LLM no está disponible (cuota o saturación): el cliente debe pausar y reanudar más tarde. */
  paused?: { reason: "quota" | "overloaded" | "timeout"; message: string };
};

const TERMINAL: ReadonlySet<RunStatus> = new Set(["completed", "completed_with_errors", "error"]);
export const isTerminal = (status: RunStatus) => TERMINAL.has(status);

export class RunNotFoundError extends Error {
  constructor(id: string) {
    super(`No existe el run ${id}.`);
    this.name = "RunNotFoundError";
  }
}

const usagePayload = (llm: LLMProvider, usage: Usage | undefined): Record<string, Json> =>
  usage ? { model: llm.model, usage: { input: usage.inputTokens, output: usage.outputTokens, total: usage.totalTokens } } : { model: llm.model };

/** Crea un run y copia la web semilla a su workspace. */
export async function createRun(
  store: RunStore,
  request: string,
  seedFiles: ReadonlyArray<{ path: string; content: string }>,
): Promise<Run> {
  const run = await store.createRun(request);
  await store.writeFiles(run.id, [...seedFiles], "seed");
  await store.addEvent({
    run_id: run.id,
    agent: "system",
    type: "status",
    message: `Run creado. Se ha copiado la web semilla (${seedFiles.length} archivos) al workspace.`,
  });
  return run;
}

/** Toma el lock, avanza un paso y lo libera. null = otro paso tiene el lock. */
export async function stepWithLock(runId: string, deps: EngineDeps): Promise<StepResult | null> {
  if (!(await deps.store.acquireLock(runId, LOCK_SECONDS))) return null;
  try {
    return await advanceRun(runId, deps);
  } finally {
    await deps.store.releaseLock(runId);
  }
}

export async function advanceRun(runId: string, deps: EngineDeps): Promise<StepResult> {
  const { store } = deps;
  const now = deps.now ?? Date.now;
  const deadline = now() + (deps.stepBudgetMs ?? STEP_BUDGET_MS);

  const run = await store.getRun(runId);
  if (!run) throw new RunNotFoundError(runId);
  if (isTerminal(run.status)) return { status: run.status, done: true };

  const setAgent = async (agent: AgentName, action: string, taskId?: string) => {
    await store.updateRun(runId, { current_agent: agent, current_action: action });
    await store.addEvent({ run_id: runId, task_id: taskId ?? null, agent, type: "status", message: action });
  };

  try {
    if (run.status === "queued") {
      await orchestrate(run, deps, deadline, setAgent);
    } else {
      const tasks = await store.listTasks(runId);
      const current = tasks.find((t) => t.status !== "done" && t.status !== "failed");
      if (!current) await finish(run, tasks, deps, deadline, setAgent);
      else if (current.status === "testing") await test(run, current, deps, deadline, setAgent);
      else await develop(run, current, deps, deadline, setAgent);
    }
  } catch (e) {
    if (e instanceof LLMUnavailableError) {
      if (e.reason === "timeout") {
        // No es un fallo: el paso se quedó sin tiempo y se continúa en el siguiente.
        await store.addEvent({ run_id: runId, agent: "system", type: "status", message: e.message });
      } else {
        await store.updateRun(runId, { current_action: "En pausa: el LLM no está disponible" });
        await store.addEvent({
          run_id: runId,
          agent: "system",
          type: "error",
          message: e.message,
          payload: { reason: e.reason, retryAfterSeconds: e.retryAfterSeconds ?? null },
        });
      }
      const latest = await store.getRun(runId);
      return { status: latest?.status ?? run.status, done: false, paused: { reason: e.reason, message: e.message } };
    }
    const message = e instanceof Error ? e.message : String(e);
    await store.updateRun(runId, { status: "error", current_agent: null, current_action: null });
    await store.addEvent({ run_id: runId, agent: "system", type: "error", message: `Error no recuperable: ${message}` });
    return { status: "error", done: true };
  }

  const latest = await store.getRun(runId);
  const status = latest?.status ?? run.status;
  return { status, done: isTerminal(status) };
}

type SetAgent = (agent: AgentName, action: string, taskId?: string) => Promise<void>;

/** Motivo más útil para mostrar en la timeline: el primer criterio o check que falla. */
function firstProblem(verdict: TestingResult): string {
  const criterion = verdict.results.find((r) => !r.passed);
  if (criterion) return criterion.reason;
  const check = verdict.deterministic.find((c) => !c.passed);
  if (check) return check.detail ?? check.label;
  return verdict.feedback.split("\n")[0] ?? "";
}

async function orchestrate(run: Run, { store, llm }: EngineDeps, deadline: number, setAgent: SetAgent) {
  await setAgent("orchestrator", "Analizando la petición y planificando las tareas");
  const files = await store.listFiles(run.id);
  await store.addEvent({
    run_id: run.id,
    agent: "orchestrator",
    type: "thinking",
    message: `Leyendo la petición y los ${files.length} archivos de la web`,
  });

  let result: Awaited<ReturnType<typeof planRun>>;
  try {
    result = await planRun({ llm, request: run.request, files, deadline });
  } catch (e) {
    if (e instanceof InvalidOutputError) throw new Error(`El Orquestador no devolvió un plan válido (${e.message}).`);
    throw e;
  }
  const { plan, usage } = result;

  if (plan.tasks.length === 0) {
    await store.updateRun(run.id, {
      status: "completed",
      plan_summary: plan.summary,
      final_summary: plan.summary,
      current_agent: null,
      current_action: null,
    });
    await store.addEvent({
      run_id: run.id,
      agent: "orchestrator",
      type: "result",
      message: `Sin tareas: ${plan.summary}`,
      payload: usagePayload(llm, usage),
    });
    return;
  }

  const tasks = await store.createTasks(run.id, plan.tasks);
  await store.updateRun(run.id, { status: "running", plan_summary: plan.summary, current_action: `Plan listo: ${tasks.length} tarea${tasks.length === 1 ? "" : "s"}` });
  await store.addEvent({
    run_id: run.id,
    agent: "orchestrator",
    type: "result",
    message: `Plan listo con ${tasks.length} tarea${tasks.length === 1 ? "" : "s"}: ${plan.summary}`,
    payload: { ...usagePayload(llm, usage), tasks: tasks.map((t) => t.title) },
  });
}

async function develop(run: Run, task: Task, { store, llm, now }: EngineDeps, deadline: number, setAgent: SetAgent) {
  // in_progress = un paso anterior se interrumpió (p. ej. sin cuota): se repite el mismo intento.
  const resumed = task.status === "in_progress";
  const attempt = resumed ? Math.max(task.attempts, 1) : task.attempts + 1;
  let feedback: string | null = null;
  if (attempt > 1) {
    const reports = (await store.listReports(run.id)).filter((r) => r.task_id === task.id && !r.passed);
    feedback = reports.at(-1)?.feedback ?? null;
  }

  await store.updateTask(task.id, { status: "in_progress", attempts: attempt });
  await setAgent("develop", `Trabajando en «${task.title}» (intento ${attempt}/${MAX_ATTEMPTS})`, task.id);

  const snapshot = await store.listFiles(run.id);
  const contents = new Map(snapshot.map((f) => [f.path, f.content]));
  const workspace: Workspace = {
    list: () => [...contents.entries()].map(([path, c]) => ({ path, bytes: c.length })),
    read: (path) => contents.get(path),
    write: async (path, content) => {
      await store.writeFile(run.id, path, content, "develop");
      contents.set(path, content);
    },
    delete: async (path) => {
      const deleted = await store.deleteFile(run.id, path);
      contents.delete(path);
      return deleted;
    },
  };

  const result = await runDevelop({
    llm,
    task,
    attempt,
    feedback,
    workspace,
    files: snapshot,
    deadline,
    now,
    onAction: (message, payload) =>
      store.addEvent({ run_id: run.id, task_id: task.id, agent: "develop", type: "action", message, payload: (payload ?? null) as Json }),
  });

  await store.updateTask(task.id, { status: "testing" });
  await store.updateRun(run.id, { current_action: `Entregado a Testing: «${task.title}»` });
  await store.addEvent({
    run_id: run.id,
    task_id: task.id,
    agent: "develop",
    type: "result",
    message: result.summary,
    payload: { ...usagePayload(llm, result.usage), touched: result.touched, turns: result.turns, finished: result.finished, summary: result.summary },
  });
}

async function test(run: Run, task: Task, { store, llm }: EngineDeps, deadline: number, setAgent: SetAgent) {
  const attempt = Math.max(task.attempts, 1);
  await setAgent("testing", `Revisando «${task.title}» (intento ${attempt}/${MAX_ATTEMPTS})`, task.id);

  const files = await store.listFiles(run.id);
  const events = await store.listEvents(run.id);
  const developSummary =
    events.filter((e) => e.task_id === task.id && e.agent === "develop" && e.type === "result").at(-1)?.message ?? null;

  let verdict: TestingResult;
  try {
    verdict = await runTesting({ llm, task, attempt, developSummary, files, deadline });
  } catch (e) {
    if (!(e instanceof InvalidOutputError)) throw e;
    // El LLM no devolvió un informe válido: se decide solo con los checks deterministas.
    const { results, allPassed } = runDeterministicChecks(task.acceptance_criteria, toFileMap(files));
    verdict = {
      passed: allPassed,
      deterministic: results,
      results: task.acceptance_criteria.map((c) => ({
        criterion_id: c.id,
        passed: results.find((r) => r.id === c.id)?.passed ?? allPassed,
        reason: "Evaluado solo con checks deterministas (el LLM no devolvió un informe válido).",
      })),
      feedback: allPassed
        ? "Los checks deterministas pasan."
        : `Checks fallidos:\n${results.filter((r) => !r.passed).map((r) => `- ${r.label}: ${r.detail ?? ""}`).join("\n")}`,
    };
    await store.addEvent({ run_id: run.id, task_id: task.id, agent: "testing", type: "error", message: e.message });
  }

  await store.addReport({
    task_id: task.id,
    run_id: run.id,
    attempt,
    passed: verdict.passed,
    deterministic_checks: verdict.deterministic,
    results: verdict.results,
    feedback: verdict.feedback,
  });

  const failedCriteria = verdict.results.filter((r) => !r.passed).length;
  const payload = { ...usagePayload(llm, verdict.usage), passed: verdict.passed, attempt, failedCriteria };

  if (verdict.passed) {
    await store.updateTask(task.id, { status: "done" });
    await store.updateRun(run.id, { current_action: `«${task.title}» supera las pruebas` });
    await store.addEvent({ run_id: run.id, task_id: task.id, agent: "testing", type: "result", message: `«${task.title}» supera las pruebas`, payload });
  } else if (attempt >= MAX_ATTEMPTS) {
    await store.updateTask(task.id, { status: "failed" });
    await store.updateRun(run.id, { current_action: `«${task.title}» falla tras ${MAX_ATTEMPTS} intentos` });
    await store.addEvent({
      run_id: run.id,
      task_id: task.id,
      agent: "testing",
      type: "result",
      message: `«${task.title}» no pasa tras ${MAX_ATTEMPTS} intentos. Se marca como fallida.`,
      payload,
    });
  } else {
    await store.updateTask(task.id, { status: "changes_requested" });
    await store.updateRun(run.id, { current_action: `Cambios pedidos en «${task.title}»` });
    await store.addEvent({
      run_id: run.id,
      task_id: task.id,
      agent: "testing",
      type: "result",
      message: `Cambios pedidos (${failedCriteria} criterio${failedCriteria === 1 ? "" : "s"} sin cumplir): ${firstProblem(verdict)}`,
      payload,
    });
  }
}

async function finish(run: Run, tasks: Task[], { store, llm }: EngineDeps, deadline: number, setAgent: SetAgent) {
  await setAgent("orchestrator", "Redactando el resumen final");
  const failed = tasks.filter((t) => t.status === "failed").length;
  let summary: string;
  let usage: Usage | undefined;
  try {
    ({ summary, usage } = await summarizeRun({ llm, request: run.request, tasks, deadline }));
  } catch (e) {
    if (!(e instanceof InvalidOutputError)) throw e;
    summary = `Se completaron ${tasks.length - failed} de ${tasks.length} tareas.${failed ? ` ${failed} no superaron las pruebas tras ${MAX_ATTEMPTS} intentos.` : ""}`;
  }
  const status: RunStatus = failed > 0 ? "completed_with_errors" : "completed";
  await store.updateRun(run.id, { status, final_summary: summary, current_agent: null, current_action: null });
  await store.addEvent({ run_id: run.id, agent: "orchestrator", type: "result", message: summary, payload: { ...usagePayload(llm, usage), status } });
}
