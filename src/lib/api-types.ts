// Contratos de la API compartidos entre las rutas y la UI.
import type { RunStatus } from "./supabase/types";

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
