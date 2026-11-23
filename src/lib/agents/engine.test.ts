import { describe, expect, it } from "vitest";
import { loadSeedFiles } from "../../seed";
import { createMockProvider, createScriptedProvider } from "../llm/mock";
import { LLMUnavailableError, type CallInput, type CallOutput } from "../llm/types";
import { runGlobalChecks, toFileMap } from "./checks";
import { advanceRun, createRun, stepWithLock, type EngineDeps } from "./engine";
import { createMemoryStore } from "./store-memory";

const tool = (name: string, args: Record<string, unknown>): CallOutput => ({ toolCalls: [{ id: name, name, args }] });

const PLAN = {
  summary: "Dos tareas de prueba.",
  tasks: [
    {
      title: "Tarea A",
      description: "Crear a.html",
      acceptance_criteria: [{ description: "Existe a.html", check: { type: "file_exists", path: "a.html" } }, { description: "Bonita" }],
    },
    {
      title: "Tarea B",
      description: "Crear b.html",
      acceptance_criteria: [{ description: "Existe b.html", check: { type: "file_exists", path: "b.html" } }],
    },
  ],
};

const page = (t: string) => `<!DOCTYPE html><html><head><title>${t}</title></head><body><a href="index.html">Inicio</a></body></html>`;

/**
 * Guion: el Orquestador planifica A y B; Develop crea el archivo de la tarea y
 * termina en el mismo turno; Testing (LLM) rechaza A una vez y B siempre.
 */
function scriptedTeam() {
  const testingCalls: Record<string, number> = {};
  return createScriptedProvider((input: CallInput) => {
    const meta = input.meta ?? {};
    const title = (meta.task as { title?: string } | undefined)?.title ?? "";
    switch (meta.agent) {
      case "orchestrator":
        return tool("create_plan", PLAN);
      case "develop": {
        const file = title === "Tarea A" ? "a.html" : "b.html";
        return {
          toolCalls: [
            { id: "w", name: "write_file", args: { path: file, content: page(file) } },
            { id: "f", name: "finish", args: { summary: `Creado ${file}` } },
          ],
        };
      }
      case "testing": {
        testingCalls[title] = (testingCalls[title] ?? 0) + 1;
        const passed = title === "Tarea A" && testingCalls[title] >= 2;
        return tool("submit_report", {
          passed,
          results: [{ criterion_id: "c1", passed, reason: passed ? "ok" : "no" }],
          feedback_for_develop: passed ? "ok" : `Arregla ${title} (revisión ${testingCalls[title]})`,
        });
      }
      case "summary":
        return tool("submit_summary", { summary: "Resumen de prueba." });
      default:
        throw new Error(`Llamada inesperada: ${String(meta.agent)}`);
    }
  });
}

async function setup(llm: EngineDeps["llm"], request = "Añade dos páginas de prueba") {
  const store = createMemoryStore();
  const seed = await loadSeedFiles();
  const run = await createRun(store, request, seed);
  return { store, run, deps: { store, llm } satisfies EngineDeps };
}

async function runToEnd(runId: string, deps: EngineDeps, maxSteps = 40) {
  let steps = 0;
  for (; steps < maxSteps; steps++) {
    const r = await advanceRun(runId, deps);
    if (r.done || r.paused) return { result: r, steps: steps + 1 };
  }
  throw new Error("El run no terminó");
}

describe("engine con proveedor guionizado", () => {
  it("una tarea falla una vez y luego pasa; otra agota los 3 intentos", async () => {
    const llm = scriptedTeam();
    const { store, run, deps } = await setup(llm);
    const { result } = await runToEnd(run.id, deps);

    expect(result).toEqual({ status: "completed_with_errors", done: true });
    const [a, b] = await store.listTasks(run.id);
    expect(a).toMatchObject({ title: "Tarea A", status: "done", attempts: 2 });
    expect(b).toMatchObject({ title: "Tarea B", status: "failed", attempts: 3 });

    const reports = await store.listReports(run.id);
    expect(reports.filter((r) => r.task_id === a?.id).map((r) => r.passed)).toEqual([false, true]);
    expect(reports.filter((r) => r.task_id === b?.id).map((r) => r.attempt)).toEqual([1, 2, 3]);

    // Develop recibe el feedback de Testing en el segundo intento.
    const developA2 = llm.calls.find((c) => c.meta?.agent === "develop" && c.meta.attempt === 2 && (c.meta.task as { title: string }).title === "Tarea A");
    expect(developA2?.messages[0]).toMatchObject({ role: "user" });
    expect(JSON.stringify(developA2?.messages[0])).toContain("Arregla Tarea A (revisión 1)");

    const finalRun = await store.getRun(run.id);
    expect(finalRun).toMatchObject({ final_summary: "Resumen de prueba.", current_agent: null });

    const events = await store.listEvents(run.id);
    expect(events.some((e) => e.agent === "develop" && e.type === "action" && e.message === "Creando a.html")).toBe(true);
    expect(events.some((e) => e.agent === "testing" && e.message.startsWith("«Tarea B» no pasa"))).toBe(true);
    // Los archivos de Develop quedan marcados como suyos.
    const files = await store.listFiles(run.id);
    expect(files.find((f) => f.path === "a.html")?.updated_by).toBe("develop");
    expect(files.find((f) => f.path === "index.html")?.updated_by).toBe("seed");
  });

  it("un check determinista fallido impide pasar aunque el LLM diga que sí", async () => {
    const llm = createScriptedProvider((input) => {
      switch (input.meta?.agent) {
        case "orchestrator":
          return tool("create_plan", { summary: "x", tasks: [PLAN.tasks[0]] });
        case "develop":
          return tool("finish", { summary: "No he hecho nada" }); // no crea a.html
        case "testing":
          return tool("submit_report", { passed: true, results: [{ criterion_id: "c1", passed: true, reason: "ok" }], feedback_for_develop: "" });
        default:
          return tool("submit_summary", { summary: "fin" });
      }
    });
    const { store, run, deps } = await setup(llm);
    await advanceRun(run.id, deps); // plan
    await advanceRun(run.id, deps); // develop
    await advanceRun(run.id, deps); // testing
    const [task] = await store.listTasks(run.id);
    expect(task?.status).toBe("changes_requested");
    const [report] = await store.listReports(run.id);
    expect(report?.passed).toBe(false);
    expect(report?.feedback).toContain("Checks deterministas fallidos");
    expect(report?.results.find((r) => r.criterion_id === "c1")?.passed).toBe(false);
  });

  it("si la petición no es sobre la web, 0 tareas y el run termina limpio", async () => {
    const llm = createScriptedProvider(() => tool("create_plan", { summary: "Eso no es un cambio en la web.", tasks: [] }));
    const { store, run, deps } = await setup(llm, "¿Qué tiempo hace mañana?");
    expect(await advanceRun(run.id, deps)).toEqual({ status: "completed", done: true });
    expect((await store.getRun(run.id))?.final_summary).toBe("Eso no es un cambio en la web.");
    expect(await store.listTasks(run.id)).toEqual([]);
  });

  it("sin cuota: el run se pausa (no pasa a error) y se reanuda sin gastar un intento", async () => {
    let quotaLeft = true;
    const base = scriptedTeam();
    const llm = createScriptedProvider((input) => {
      if (input.meta?.agent === "develop" && quotaLeft) {
        quotaLeft = false;
        throw new LLMUnavailableError("quota", "Cuota agotada (test)", 30);
      }
      return base.callWithTools(input);
    });
    const { store, run, deps } = await setup(llm);
    await advanceRun(run.id, deps); // plan
    const paused = await advanceRun(run.id, deps); // develop → sin cuota
    expect(paused).toMatchObject({ status: "running", done: false, paused: { reason: "quota" } });
    expect((await store.listTasks(run.id))[0]).toMatchObject({ status: "in_progress", attempts: 1 });
    const events = await store.listEvents(run.id);
    expect(events.at(-1)).toMatchObject({ agent: "system", type: "error", message: "Cuota agotada (test)" });

    // Reanudar: repite el intento 1 (no lo cuenta dos veces).
    await advanceRun(run.id, deps);
    expect((await store.listTasks(run.id))[0]).toMatchObject({ status: "testing", attempts: 1 });
  });

  it("un plan inválido dos veces deja el run en error con un mensaje claro", async () => {
    const llm = createScriptedProvider(() => tool("create_plan", { nada: true }));
    const { store, run, deps } = await setup(llm);
    expect(await advanceRun(run.id, deps)).toEqual({ status: "error", done: true });
    expect(llm.calls).toHaveLength(2); // reintenta una vez devolviendo el error
    expect((await store.listEvents(run.id)).at(-1)?.message).toMatch(/no devolvió un plan válido/);
  });

  it("el lock impide dos pasos a la vez", async () => {
    const { store, run, deps } = await setup(scriptedTeam());
    expect(await store.acquireLock(run.id, 90)).toBe(true);
    expect(await stepWithLock(run.id, deps)).toBeNull();
    await store.releaseLock(run.id);
    expect(await stepWithLock(run.id, deps)).toMatchObject({ status: "running" });
    expect((await store.getRun(run.id))?.locked_until).toBeNull();
  });
});

describe("demo con LLM_PROVIDER=mock", () => {
  it.each([
    ["Añade una página de contacto con formulario", "completed"],
    ["Añade una sección de testimonios", "completed"],
    ["Haz el menú responsive con botón hamburguesa", "completed"],
    ["Pon un aviso de que cerramos en agosto", "completed"],
  ])("«%s» termina en %s y la web sigue pasando los checks globales", async (request, status) => {
    const { store, run, deps } = await setup(createMockProvider({ delayMs: 0 }), request);
    const { result } = await runToEnd(run.id, deps);
    expect(result.status).toBe(status);
    const files = await store.listFiles(run.id);
    expect(runGlobalChecks(toFileMap(files)).filter((r) => !r.passed)).toEqual([]);
  });

  it("la tarea de navegación de contacto necesita dos intentos (se ve el ciclo de cambios)", async () => {
    const { store, run, deps } = await setup(createMockProvider({ delayMs: 0 }), "Añade una página de contacto");
    await runToEnd(run.id, deps);
    const tasks = await store.listTasks(run.id);
    expect(tasks.map((t) => [t.status, t.attempts])).toEqual([
      ["done", 1],
      ["done", 2],
    ]);
  });
});
