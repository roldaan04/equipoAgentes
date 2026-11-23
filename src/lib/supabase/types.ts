// Tipos escritos a mano según supabase/migrations/0001_init.sql + 0002_run_quota.sql.
// Si cambia el esquema, se actualiza aquí en el mismo cambio que la migración.

export const RUN_STATUSES = ["queued", "running", "completed", "completed_with_errors", "error"] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

export const TASK_STATUSES = ["pending", "in_progress", "testing", "changes_requested", "done", "failed"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const AGENTS = ["orchestrator", "develop", "testing"] as const;
export type AgentName = (typeof AGENTS)[number];
export type EventAgent = AgentName | "system";

export const EVENT_TYPES = ["status", "thinking", "action", "result", "error"] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export type FileAuthor = "seed" | "develop";

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

/** Check determinista asociado a un criterio de aceptación. */
export type CriterionCheck =
  | { type: "file_exists"; path: string }
  | { type: "selector_exists"; path: string; selector: string }
  | { type: "text_contains"; path: string; text: string }
  | { type: "link_exists"; from: string; href: string };

export type AcceptanceCriterion = {
  id: string;
  description: string;
  check?: CriterionCheck;
};

/** Resultado de un check determinista (guardado en test_reports.deterministic_checks). */
export type DeterministicCheckResult = {
  id: string; // criterion_id o id del check global ("global:html:index.html")
  label: string;
  passed: boolean;
  detail?: string;
};

/** Veredicto del LLM por criterio (guardado en test_reports.results). */
export type CriterionResult = {
  criterion_id: string;
  passed: boolean;
  reason: string;
};

export type Run = {
  id: string;
  request: string;
  status: RunStatus;
  current_agent: AgentName | null;
  current_action: string | null;
  plan_summary: string | null;
  final_summary: string | null;
  locked_until: string | null;
  created_at: string;
  updated_at: string;
};

export type Task = {
  id: string;
  run_id: string;
  position: number;
  title: string;
  description: string;
  acceptance_criteria: AcceptanceCriterion[];
  status: TaskStatus;
  assignee: string;
  attempts: number;
  created_at: string;
  updated_at: string;
};

export type TestReport = {
  id: string;
  task_id: string;
  run_id: string;
  attempt: number;
  passed: boolean;
  deterministic_checks: DeterministicCheckResult[];
  results: CriterionResult[];
  feedback: string | null;
  created_at: string;
};

export type AgentEvent = {
  id: number;
  run_id: string;
  task_id: string | null;
  agent: EventAgent;
  type: EventType;
  message: string;
  payload: Json | null;
  created_at: string;
};

export type WorkspaceFile = {
  id: string;
  run_id: string;
  path: string;
  content: string;
  updated_by: FileAuthor | null;
  updated_at: string;
};

/** Tabla privada (sin lectura pública): solo la usa la protección de cuota. */
export type RunQuota = {
  run_id: string;
  client_ip_hash: string;
  created_at: string;
};

// --- Columnas públicas: la lectura es pública, así que nunca `select *`. ---
export const RUN_COLUMNS =
  "id, request, status, current_agent, current_action, plan_summary, final_summary, locked_until, created_at, updated_at";
export const TASK_COLUMNS =
  "id, run_id, position, title, description, acceptance_criteria, status, assignee, attempts, created_at, updated_at";
export const TEST_REPORT_COLUMNS =
  "id, task_id, run_id, attempt, passed, deterministic_checks, results, feedback, created_at";
export const EVENT_COLUMNS = "id, run_id, task_id, agent, type, message, payload, created_at";
export const FILE_COLUMNS = "id, run_id, path, content, updated_by, updated_at";

// --- Tipo Database para tipar el cliente de supabase-js. ---
type Table<Row, Insert, Update = Partial<Insert>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      runs: Table<
        Run,
        Pick<Run, "request"> & Partial<Omit<Run, "request">>
      >;
      tasks: Table<
        Task,
        Pick<Task, "run_id" | "position" | "title" | "description"> &
          Partial<Omit<Task, "run_id" | "position" | "title" | "description">>
      >;
      test_reports: Table<
        TestReport,
        Pick<TestReport, "task_id" | "run_id" | "attempt" | "passed"> &
          Partial<Omit<TestReport, "task_id" | "run_id" | "attempt" | "passed">>
      >;
      agent_events: Table<
        AgentEvent,
        Pick<AgentEvent, "run_id" | "agent" | "type" | "message"> &
          Partial<Omit<AgentEvent, "id" | "run_id" | "agent" | "type" | "message">>
      >;
      files: Table<
        WorkspaceFile,
        Pick<WorkspaceFile, "run_id" | "path" | "content"> &
          Partial<Omit<WorkspaceFile, "run_id" | "path" | "content">>
      >;
      run_quota: Table<RunQuota, Pick<RunQuota, "run_id" | "client_ip_hash"> & Partial<RunQuota>>;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
  };
};
