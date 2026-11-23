import "server-only";
import type { EngineDeps } from "@/lib/agents/engine";
import { createSupabaseStore } from "@/lib/agents/store-supabase";
import { getServerEnv } from "@/lib/env";
import { getLLMProvider } from "@/lib/llm";
import { createServerClient } from "@/lib/supabase/server";

/** Dependencias del engine para las rutas de la API (Supabase + proveedor LLM de LLM_PROVIDER). */
export function getEngineDeps(): EngineDeps {
  return { store: createSupabaseStore(createServerClient()), llm: getLLMProvider(getServerEnv()) };
}
