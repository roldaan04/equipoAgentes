// npm run demo:cli -- "Añade una página de contacto" [--mock] [--memory] [--run <id>]
//
// Ejecuta el motor sin UI: crea el run (o reanuda uno con --run), llama a
// advanceRun en bucle con el lock e imprime los eventos de los agentes.
//   --mock    usa el proveedor mock (sin gastar cuota)
//   --memory  usa un almacén en memoria (sin Supabase; implica un run nuevo)
import { getServerEnv } from "@/lib/env";
import { stepWithLock, createRun, type EngineDeps } from "@/lib/agents/engine";
import { createMemoryStore } from "@/lib/agents/store-memory";
import { createSupabaseStore } from "@/lib/agents/store-supabase";
import type { RunStore } from "@/lib/agents/store";
import { getLLMProvider } from "@/lib/llm";
import { createMockProvider } from "@/lib/llm/mock";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AgentEvent } from "@/lib/supabase/types";
import { loadSeedFiles } from "@/seed";

const COLORS: Record<string, string> = { orchestrator: "\x1b[35m", develop: "\x1b[34m", testing: "\x1b[33m", system: "\x1b[90m" };
const RESET = "\x1b[0m";
const NAMES: Record<string, string> = { orchestrator: "Orquestador", develop: "Develop", testing: "Testing", system: "Sistema" };

function parseArgs(argv: string[]) {
  const flags = new Set(argv.filter((a) => a === "--mock" || a === "--memory"));
  const runIdx = argv.indexOf("--run");
  const runId = runIdx >= 0 ? argv[runIdx + 1] : undefined;
  const request = argv.filter((a, i) => !a.startsWith("--") && (runIdx < 0 || i !== runIdx + 1)).join(" ").trim();
  return { mock: flags.has("--mock"), memory: flags.has("--memory"), runId, request };
}

function printEvent(e: AgentEvent) {
  const time = new Date(e.created_at).toLocaleTimeString("es-ES");
  const color = COLORS[e.agent] ?? "";
  const icon = { status: "▶", thinking: "…", action: "·", result: "✓", error: "✗" }[e.type];
  console.log(`${time} ${color}${(NAMES[e.agent] ?? e.agent).padEnd(11)}${RESET} ${icon} ${e.message}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const env = getServerEnv();
  const llm = args.mock ? createMockProvider({ delayMs: 0 }) : getLLMProvider(env);
  const store: RunStore = args.memory ? createMemoryStore() : createSupabaseStore(createAdminClient());
  const deps: EngineDeps = { store, llm };

  let runId = args.runId;
  if (!runId || args.memory) {
    if (args.request.length < 5) {
      console.error('Uso: npm run demo:cli -- "Añade una página de contacto" [--mock] [--memory] [--run <id>]');
      process.exit(1);
    }
    const run = await createRun(store, args.request, await loadSeedFiles());
    runId = run.id;
  }
  console.log(`\nRun ${runId} · LLM: ${llm.name} (${llm.model}) · almacén: ${args.memory ? "memoria" : "Supabase"}\n`);

  let lastEventId = 0;
  const flush = async () => {
    for (const e of await store.listEvents(runId, lastEventId)) {
      printEvent(e);
      lastEventId = e.id;
    }
  };

  for (let step = 1; step <= 60; step++) {
    const result = await stepWithLock(runId, deps);
    await flush();
    if (!result) {
      console.log("Otro paso tiene el lock; reintento en 2 s…");
      await new Promise((r) => setTimeout(r, 2000));
      continue;
    }
    if (result.done) {
      const run = await store.getRun(runId);
      const tasks = await store.listTasks(runId);
      console.log(`\nEstado final: ${result.status} · ${step} pasos`);
      for (const t of tasks) console.log(`  ${t.status === "done" ? "✓" : "✗"} ${t.title} (${t.attempts} intento${t.attempts === 1 ? "" : "s"})`);
      if (run?.final_summary) console.log(`\nResumen: ${run.final_summary}`);
      if (!args.memory) console.log(`\nArchivos en Supabase (tabla files, run_id = ${runId}).`);
      return;
    }
    if (result.paused && result.paused.reason !== "timeout") {
      console.log(`\nEn pausa (${result.paused.reason}). Reanuda más tarde con:\n  npm run demo:cli -- --run ${runId}${args.mock ? " --mock" : ""}`);
      process.exit(2);
    }
    await new Promise((r) => setTimeout(r, 1000)); // 1 s entre pasos (cuota gratuita)
  }
  console.log("Se alcanzó el máximo de pasos de la CLI.");
}

main().catch((e: unknown) => {
  console.error(`\nError: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
