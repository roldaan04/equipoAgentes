// npm run db:check — comprueba la conexión con Supabase y el estado del esquema.
// Nunca imprime claves ni la URL del proyecto: solo nombres de tablas, recuentos y errores.
import { createClient, type PostgrestError } from "@supabase/supabase-js";
import { getServerEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/types";

const PUBLIC_TABLES = ["runs", "tasks", "test_reports", "agent_events", "files"] as const;

let problems = 0;
const ok = (msg: string) => console.log(`  ✓ ${msg}`);
const fail = (msg: string) => {
  problems++;
  console.log(`  ✗ ${msg}`);
};
const describe = (e: PostgrestError) => `${e.code}: ${e.message}${e.hint ? ` (hint: ${e.hint})` : ""}`;

async function main() {
  const env = getServerEnv(); // lanza EnvError con los nombres de lo que falte
  const admin = createAdminClient();
  const anon = createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false },
  });

  console.log("\nTablas (clave secreta):");
  for (const table of PUBLIC_TABLES) {
    const probe = await admin.from(table).select("id").limit(1);
    if (probe.error) {
      fail(`${table}: ${describe(probe.error)}`);
      continue;
    }
    const { count } = await admin.from(table).select("id", { count: "exact", head: true });
    ok(`${table}: ${count ?? "?"} filas`);
  }

  console.log("\nLectura pública (clave publishable):");
  for (const table of PUBLIC_TABLES) {
    const { error } = await anon.from(table).select("id").limit(1);
    if (error) fail(`${table}: ${describe(error)}`);
    else ok(`${table}: legible`);
  }

  console.log("\nMigración 0002_run_quota:");
  const quota = await admin.from("run_quota").select("run_id").limit(1);
  if (quota.error) {
    fail(
      quota.error.code === "PGRST205"
        ? "La tabla run_quota no existe → ejecuta supabase/migrations/0002_run_quota.sql en el SQL Editor."
        : `run_quota: ${describe(quota.error)}`,
    );
  } else {
    ok("run_quota existe y la clave secreta puede leerla");
    const anonQuota = await anon.from("run_quota").select("run_id").limit(1);
    if (anonQuota.error || (anonQuota.data ?? []).length === 0) ok("run_quota NO es legible con la clave publishable");
    else fail("run_quota es legible con la clave publishable: revisa el RLS");
  }
  // Se pide la columna eliminada a propósito: el error 42703 confirma que ya no existe.
  const column = await admin.from("runs").select("client_ip_hash" as "id").limit(1);
  if (column.error?.code === "42703") ok("runs ya no tiene la columna client_ip_hash");
  else if (!column.error) fail("runs todavía tiene client_ip_hash → falta ejecutar la migración 0002");
  else fail(`No se pudo comprobar la columna client_ip_hash (${describe(column.error)})`);

  console.log(`\nProveedor LLM: ${env.LLM_PROVIDER}${env.LLM_PROVIDER === "gemini" ? ` (modelo ${env.LLM_MODEL})` : ""}`);
  if (env.DEMO_ACCESS_CODE === undefined) console.log("  ! DEMO_ACCESS_CODE vacío: la demo no pedirá código de acceso");

  console.log(problems === 0 ? "\nTodo correcto.\n" : `\n${problems} problema(s).\n`);
  process.exit(problems === 0 ? 0 : 1);
}

main().catch((e: unknown) => {
  console.error(`\nError: ${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
