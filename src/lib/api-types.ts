// Contratos de la API compartidos entre las rutas y la UI.
import type { AgentEvent, Run, RunStatus, Task, TestReport, WorkspaceFile } from "./supabase/types";

export type CreateRunBody = { request: string; accessCode?: string };
export type CreateRunResponse = { id: string };

export type StepResponse = {
  status: RunStatus;
  done: boolean;
  /** El LLM no está disponible (cuota agotada o saturado): la UI se pausa y avisa. */
  quotaExhausted: boolean;
  paused?: { reason: "quota" | "overloaded" | "timeout"; message: string };
};

export type ConfigResponse = {
  accessCodeRequired: boolean;
  provider: "gemini" | "mock";
  model: string;
};

export type ApiError = { error: string; code?: string };

export const REQUEST_MIN = 5;
export const REQUEST_MAX = 1000;

// --- Vista de un run (GET /api/runs/[id]) y lista (GET /api/runs) ---
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

export type FilesResponse = { files: WorkspaceFile[] };
