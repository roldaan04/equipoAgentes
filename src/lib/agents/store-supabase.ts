// RunStore sobre Supabase. Recibe el cliente con la clave secreta (inyectado),
// así este módulo no depende de Next ni de `server-only`.
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  EVENT_COLUMNS,
  FILE_COLUMNS,
  RUN_COLUMNS,
  TASK_COLUMNS,
  TEST_REPORT_COLUMNS,
  type Database,
} from "../supabase/types";
import type { RunStore } from "./store";

type Client = SupabaseClient<Database>;

function must<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`Supabase (${what}): ${res.error.message}`);
  if (res.data === null) throw new Error(`Supabase (${what}): sin datos`);
  return res.data;
}

function check(res: { error: { message: string } | null }, what: string): void {
  if (res.error) throw new Error(`Supabase (${what}): ${res.error.message}`);
}

export function createSupabaseStore(db: Client): RunStore {
  return {
    async createRun(request) {
      return must(await db.from("runs").insert({ request }).select(RUN_COLUMNS).single(), "crear run");
    },
    async getRun(id) {
      const res = await db.from("runs").select(RUN_COLUMNS).eq("id", id).maybeSingle();
      check(res, "leer run");
      return res.data;
    },
    async updateRun(id, patch) {
      check(await db.from("runs").update(patch).eq("id", id), "actualizar run");
    },
    async acquireLock(id, seconds) {
      const nowIso = new Date().toISOString();
      const res = await db
        .from("runs")
        .update({ locked_until: new Date(Date.now() + seconds * 1000).toISOString() })
        .eq("id", id)
        .or(`locked_until.is.null,locked_until.lt.${nowIso}`)
        .select("id");
      check(res, "tomar lock");
      return (res.data ?? []).length === 1;
    },
    async releaseLock(id) {
      check(await db.from("runs").update({ locked_until: null }).eq("id", id), "liberar lock");
    },

    async listTasks(runId) {
      return must(await db.from("tasks").select(TASK_COLUMNS).eq("run_id", runId).order("position"), "leer tareas");
    },
    async createTasks(runId, tasks) {
      const rows = tasks.map((t, i) => ({ run_id: runId, position: i + 1, ...t }));
      return must(await db.from("tasks").insert(rows).select(TASK_COLUMNS).order("position"), "crear tareas");
    },
    async updateTask(id, patch) {
      check(await db.from("tasks").update(patch).eq("id", id), "actualizar tarea");
    },

    async addReport(report) {
      return must(await db.from("test_reports").insert(report).select(TEST_REPORT_COLUMNS).single(), "guardar informe");
    },
    async listReports(runId) {
      return must(
        await db.from("test_reports").select(TEST_REPORT_COLUMNS).eq("run_id", runId).order("created_at"),
        "leer informes",
      );
    },

    async addEvent(event) {
      check(await db.from("agent_events").insert(event), "guardar evento");
    },
    async listEvents(runId, afterId = 0) {
      return must(
        await db.from("agent_events").select(EVENT_COLUMNS).eq("run_id", runId).gt("id", afterId).order("id").limit(1000),
        "leer eventos",
      );
    },

    async listFiles(runId) {
      return must(await db.from("files").select(FILE_COLUMNS).eq("run_id", runId).order("path"), "leer archivos");
    },
    async writeFile(runId, path, content, by) {
      check(
        await db.from("files").upsert({ run_id: runId, path, content, updated_by: by }, { onConflict: "run_id,path" }),
        `escribir ${path}`,
      );
    },
    async writeFiles(runId, files, by) {
      if (files.length === 0) return;
      const rows = files.map((f) => ({ run_id: runId, path: f.path, content: f.content, updated_by: by }));
      check(await db.from("files").upsert(rows, { onConflict: "run_id,path" }), "escribir archivos");
    },
    async deleteFile(runId, path) {
      const res = await db.from("files").delete().eq("run_id", runId).eq("path", path).select("id");
      check(res, `borrar ${path}`);
      return (res.data ?? []).length > 0;
    },
  };
}
