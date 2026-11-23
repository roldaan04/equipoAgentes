// Cliente del navegador con la clave publishable: solo lectura y Realtime.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getPublicEnv } from "@/lib/env";
import type { Database } from "./types";

let client: SupabaseClient<Database> | undefined;

export function getBrowserClient(): SupabaseClient<Database> {
  if (client) return client;
  const env = getPublicEnv();
  client = createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return client;
}
