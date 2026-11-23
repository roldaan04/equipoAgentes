// Acceso a datos del engine. Interfaz inyectable: Supabase en la app y la CLI,
// memoria en los tests (y en `demo:cli --memory`). Solo el engine escribe.
import type {
  AcceptanceCriterion,
  AgentEvent,
  AgentName,
  CriterionResult,
  DeterministicCheckResult,
  EventAgent,
  EventType,
  FileAuthor,
  Json,
  Run,
  RunStatus,
  Task,
  TaskStatus,
  TestReport,
  WorkspaceFile,
} from "../supabase/types";

export type RunPatch = Partial<{
  status: RunStatus;
  current_agent: AgentName | null;
  current_action: string | null;
  plan_summary: string | null;
  final_summary: string | null;
}>;

export type TaskPatch = Partial<{ status: TaskStatus; attempts: number }>;

export type NewTask = {
  title: string;
  description: string;
  acceptance_criteria: AcceptanceCriterion[];
};

export type NewReport = {
  task_id: string;
  run_id: string;
  attempt: number;
  passed: boolean;
  deterministic_checks: DeterministicCheckResult[];
  results: CriterionResult[];
  feedback: string | null;
};

export type NewEvent = {
  run_id: string;
  task_id?: string | null;
  agent: EventAgent;
  type: EventType;
  message: string;
  payload?: Json | null;
};

export interface RunStore {
  createRun(request: string): Promise<Run>;
  getRun(id: string): Promise<Run | null>;
  updateRun(id: string, patch: RunPatch): Promise<void>;
  /** Toma el lock del paso. Devuelve false si otro paso lo tiene. */
  acquireLock(id: string, seconds: number): Promise<boolean>;
  releaseLock(id: string): Promise<void>;

  listTasks(runId: string): Promise<Task[]>;
  createTasks(runId: string, tasks: NewTask[]): Promise<Task[]>;
  updateTask(id: string, patch: TaskPatch): Promise<void>;

  addReport(report: NewReport): Promise<TestReport>;
  listReports(runId: string): Promise<TestReport[]>;

  addEvent(event: NewEvent): Promise<void>;
  listEvents(runId: string, afterId?: number): Promise<AgentEvent[]>;

  listFiles(runId: string): Promise<WorkspaceFile[]>;
  writeFile(runId: string, path: string, content: string, by: FileAuthor): Promise<void>;
  writeFiles(runId: string, files: Array<{ path: string; content: string }>, by: FileAuthor): Promise<void>;
  deleteFile(runId: string, path: string): Promise<boolean>;
}
