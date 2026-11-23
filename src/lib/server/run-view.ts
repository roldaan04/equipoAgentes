import "server-only";
import type { ServerClient } from "@/lib/supabase/server";
import {
  EVENT_COLUMNS,
  RUN_COLUMNS,
  TASK_COLUMNS,
  TEST_REPORT_COLUMNS,
  type AgentEvent,
  type Run,
  type RunStatus,
  type Task,
  type TestReport,
} from "@/lib/supabase/types";

export type FileMeta = { path: string; updated_by: string | null; updated_at: string; bytes: number };

export type RunView = {
  run: Run;
  tasks: Task[];
  reports: TestReport[];
  events: AgentEvent[];
  files: FileMeta[];
};

export type RunListItem = Pick<Run, "id" | "request" | "status" | "created_at" | "updated_at"> & {
  tasks_total: number;
  tasks_done: number;
};

function fail(what: string, error: { message: string }): never {
  throw new Error(`Supabase (${what}): ${error.message}`);
}

export async function getRunView(db: ServerClient, id: string): Promise<RunView | null> {
  const runRes = await db.from("runs").select(RUN_COLUMNS).eq("id", id).maybeSingle();
  if (runRes.error) fail("leer run", runRes.error);
  if (!runRes.data) return null;

  const [tasks, reports, events, files] = await Promise.all([
    db.from("tasks").select(TASK_COLUMNS).eq("run_id", id).order("position"),
    db.from("test_reports").select(TEST_REPORT_COLUMNS).eq("run_id", id).order("created_at"),
    db.from("agent_events").select(EVENT_COLUMNS).eq("run_id", id).order("id").limit(1000),
    db.from("files").select("path, updated_by, updated_at, content").eq("run_id", id).order("path"),
  ]);
  if (tasks.error) fail("leer tareas", tasks.error);
  if (reports.error) fail("leer informes", reports.error);
  if (events.error) fail("leer eventos", events.error);
  if (files.error) fail("leer archivos", files.error);

  return {
    run: runRes.data,
    tasks: tasks.data,
    reports: reports.data,
    events: events.data,
    files: files.data.map((f) => ({ path: f.path, updated_by: f.updated_by, updated_at: f.updated_at, bytes: f.content.length })),
  };
}

export async function listRecentRuns(db: ServerClient, limit = 20): Promise<RunListItem[]> {
  const runs = await db.from("runs").select("id, request, status, created_at, updated_at").order("created_at", { ascending: false }).limit(limit);
  if (runs.error) fail("listar runs", runs.error);
  const ids = runs.data.map((r) => r.id);
  const counts = new Map<string, { total: number; done: number }>();
  if (ids.length > 0) {
    const tasks = await db.from("tasks").select("run_id, status").in("run_id", ids);
    if (tasks.error) fail("contar tareas", tasks.error);
    for (const t of tasks.data) {
      const c = counts.get(t.run_id) ?? { total: 0, done: 0 };
      c.total++;
      if (t.status === "done") c.done++;
      counts.set(t.run_id, c);
    }
  }
  return runs.data.map((r) => ({
    id: r.id,
    request: r.request,
    status: r.status as RunStatus,
    created_at: r.created_at,
    updated_at: r.updated_at,
    tasks_total: counts.get(r.id)?.total ?? 0,
    tasks_done: counts.get(r.id)?.done ?? 0,
  }));
}
