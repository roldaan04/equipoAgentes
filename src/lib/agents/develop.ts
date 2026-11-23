// Develop: bucle corto de herramientas (máx. 6 turnos) sobre el workspace.
import { addUsage } from "../llm/structured";
import type { LLMProvider, Msg, ToolResult, Usage } from "../llm/types";
import type { Task } from "../supabase/types";
import { MAX_DEVELOP_TURNS, MIN_TURN_TIME_MS } from "./limits";
import { DEVELOP_SYSTEM, developPrompt } from "./prompts";
import { DEVELOP_TOOLS, executeTool, filesBlock, type Workspace } from "./tools";

export type DevelopResult = {
  summary: string;
  finished: boolean;
  turns: number;
  touched: string[];
  usage?: Usage;
};

export async function runDevelop(opts: {
  llm: LLMProvider;
  task: Pick<Task, "title" | "description" | "acceptance_criteria">;
  attempt: number;
  feedback: string | null;
  workspace: Workspace;
  /** Snapshot inicial de los archivos (se incluyen en el prompt para ahorrar turnos). */
  files: ReadonlyArray<{ path: string; content: string }>;
  deadline: number;
  onAction: (message: string, payload?: Record<string, unknown>) => Promise<void>;
  now?: () => number;
}): Promise<DevelopResult> {
  const now = opts.now ?? Date.now;
  const messages: Msg[] = [
    {
      role: "user",
      text: developPrompt({ task: opts.task, attempt: opts.attempt, feedback: opts.feedback, filesBlock: filesBlock(opts.files) }),
    },
  ];
  const touched = new Set<string>();
  let usage: Usage | undefined;
  let turns = 0;

  while (turns < MAX_DEVELOP_TURNS) {
    if (turns > 0 && opts.deadline - now() < MIN_TURN_TIME_MS) {
      return { summary: "Develop se quedó sin tiempo en este paso; Testing revisará lo que hay.", finished: false, turns, touched: [...touched], usage };
    }
    turns++;
    const out = await opts.llm.callWithTools({
      system: DEVELOP_SYSTEM,
      messages,
      tools: DEVELOP_TOOLS,
      deadline: opts.deadline,
      meta: {
        agent: "develop",
        task: opts.task,
        attempt: opts.attempt,
        feedback: opts.feedback,
        turn: turns,
        files: Object.fromEntries(opts.files.map((f) => [f.path, f.content])),
      },
    });
    usage = addUsage(usage, out.usage);

    if (out.toolCalls.length === 0) {
      messages.push({ role: "assistant", toolCalls: [], text: out.text, raw: out.raw });
      messages.push({ role: "user", text: "Usa las herramientas para hacer la tarea y termina llamando a finish." });
      continue;
    }

    messages.push({ role: "assistant", toolCalls: out.toolCalls, text: out.text, raw: out.raw });
    const results: ToolResult[] = [];
    let finished: { summary: string } | undefined;
    for (const call of out.toolCalls) {
      const exec = await executeTool(call, opts.workspace);
      if (exec.touched) touched.add(exec.touched);
      if (exec.message) await opts.onAction(exec.message, { tool: call.name, path: exec.touched ?? null });
      if (exec.finished) finished = exec.finished;
      results.push({ id: call.id, name: call.name, result: exec.result });
    }
    if (finished) return { summary: finished.summary, finished: true, turns, touched: [...touched], usage };
    messages.push({ role: "tool", results });
  }

  return { summary: "Develop agotó sus turnos sin llamar a finish; Testing revisará lo que hay.", finished: false, turns, touched: [...touched], usage };
}
