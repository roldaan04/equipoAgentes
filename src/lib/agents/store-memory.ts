// RunStore en memoria: tests del engine y `demo:cli --memory` (sin Supabase).
import type { AgentEvent, Run, Task, TestReport, WorkspaceFile } from "../supabase/types";
import type { NewEvent, NewReport, NewTask, RunPatch, RunStore, TaskPatch } from "./store";

export function createMemoryStore(): RunStore & { dump(): { runs: Run[]; tasks: Task[]; reports: TestReport[]; events: AgentEvent[]; files: WorkspaceFile[] } } {
  const runs = new Map<string, Run>();
  const tasks = new Map<string, Task>();
  const reports: TestReport[] = [];
  const events: AgentEvent[] = [];
  const files = new Map<string, WorkspaceFile>(); // clave: runId + "\0" + path
  let eventSeq = 0;
  const now = () => new Date().toISOString();
  const key = (runId: string, path: string) => `${runId}\u0000${path}`;

  return {
    async createRun(request) {
      const run: Run = {
        id: crypto.randomUUID(),
        request,
        status: "queued",
        current_agent: null,
        current_action: null,
        plan_summary: null,
        final_summary: null,
        locked_until: null,
        created_at: now(),
        updated_at: now(),
      };
      runs.set(run.id, run);
      return { ...run };
    },
    async getRun(id) {
      const run = runs.get(id);
      return run ? { ...run } : null;
    },
    async updateRun(id, patch: RunPatch) {
      const run = runs.get(id);
      if (run) runs.set(id, { ...run, ...patch, updated_at: now() });
    },
    async acquireLock(id, seconds) {
      const run = runs.get(id);
      if (!run) return false;
      if (run.locked_until && Date.parse(run.locked_until) > Date.now()) return false;
      runs.set(id, { ...run, locked_until: new Date(Date.now() + seconds * 1000).toISOString() });
      return true;
    },
    async releaseLock(id) {
      const run = runs.get(id);
      if (run) runs.set(id, { ...run, locked_until: null });
    },

    async listTasks(runId) {
      return [...tasks.values()].filter((t) => t.run_id === runId).sort((a, b) => a.position - b.position).map((t) => ({ ...t }));
    },
    async createTasks(runId, list: NewTask[]) {
      return list.map((t, i) => {
        const task: Task = {
          id: crypto.randomUUID(),
          run_id: runId,
          position: i + 1,
          title: t.title,
          description: t.description,
          acceptance_criteria: t.acceptance_criteria,
          status: "pending",
          assignee: "develop",
          attempts: 0,
          created_at: now(),
          updated_at: now(),
        };
        tasks.set(task.id, task);
        return { ...task };
      });
    },
    async updateTask(id, patch: TaskPatch) {
      const task = tasks.get(id);
      if (task) tasks.set(id, { ...task, ...patch, updated_at: now() });
    },

    async addReport(r: NewReport) {
      const report: TestReport = { ...r, id: crypto.randomUUID(), created_at: now() };
      reports.push(report);
      return { ...report };
    },
    async listReports(runId) {
      return reports.filter((r) => r.run_id === runId).map((r) => ({ ...r }));
    },

    async addEvent(e: NewEvent) {
      events.push({
        id: ++eventSeq,
        run_id: e.run_id,
        task_id: e.task_id ?? null,
        agent: e.agent,
        type: e.type,
        message: e.message,
        payload: e.payload ?? null,
        created_at: now(),
      });
    },
    async listEvents(runId, afterId = 0) {
      return events.filter((e) => e.run_id === runId && e.id > afterId).map((e) => ({ ...e }));
    },

    async listFiles(runId) {
      return [...files.values()].filter((f) => f.run_id === runId).sort((a, b) => a.path.localeCompare(b.path)).map((f) => ({ ...f }));
    },
    async writeFile(runId, path, content, by) {
      const existing = files.get(key(runId, path));
      files.set(key(runId, path), {
        id: existing?.id ?? crypto.randomUUID(),
        run_id: runId,
        path,
        content,
        updated_by: by,
        updated_at: now(),
      });
    },
    async writeFiles(runId, list, by) {
      for (const f of list) await this.writeFile(runId, f.path, f.content, by);
    },
    async deleteFile(runId, path) {
      return files.delete(key(runId, path));
    },

    dump() {
      return {
        runs: [...runs.values()],
        tasks: [...tasks.values()],
        reports: [...reports],
        events: [...events],
        files: [...files.values()],
      };
    },
  };
}
