// Elige el proveedor con LLM_PROVIDER (gemini | mock).
import type { ServerEnv } from "../env";
import { createGeminiProvider } from "./gemini";
import { createMockProvider } from "./mock";
import type { LLMProvider } from "./types";

let cached: LLMProvider | undefined;

export function getLLMProvider(env: Pick<ServerEnv, "LLM_PROVIDER" | "LLM_MODEL" | "GEMINI_API_KEY">): LLMProvider {
  if (cached) return cached;
  if (env.LLM_PROVIDER === "mock") {
    cached = createMockProvider();
  } else {
    if (!env.GEMINI_API_KEY || !env.LLM_MODEL) throw new Error("Faltan GEMINI_API_KEY o LLM_MODEL para usar Gemini.");
    cached = createGeminiProvider({ apiKey: env.GEMINI_API_KEY, model: env.LLM_MODEL });
  }
  return cached;
}

export * from "./types";
