// Cliente con la clave secreta. Hace TODAS las escrituras.
// No lleva `server-only` para que la CLI (tsx) y los scripts puedan usarlo;
// la app lo importa siempre a través de ./server.ts, que sí lo lleva.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getServerEnv } from "@/lib/env";
import type { Database } from "./types";

export type AdminClient = SupabaseClient<Database>;

let client: AdminClient | undefined;

export function createAdminClient(): AdminClient {
  if (client) return client;
  const env = getServerEnv();
  client = createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return client;
}
