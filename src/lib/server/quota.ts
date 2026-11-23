import "server-only";
import type { ServerClient } from "@/lib/supabase/server";
import { evaluateQuota, type QuotaDecision } from "./quota-rules";

/** Cuenta los runs de la última hora (global y por IP) en la tabla privada run_quota. */
export async function checkQuota(
  db: ServerClient,
  ipHash: string,
  limits: { maxPerHour: number; maxPerIpPerHour: number },
): Promise<QuotaDecision> {
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const [global, perIp] = await Promise.all([
    db.from("run_quota").select("run_id", { count: "exact", head: true }).gte("created_at", since),
    db.from("run_quota").select("run_id", { count: "exact", head: true }).gte("created_at", since).eq("client_ip_hash", ipHash),
  ]);
  if (global.error || perIp.error) {
    throw new Error(`No se pudo comprobar la cuota de la demo (${global.error?.message ?? perIp.error?.message ?? "error desconocido"}).`);
  }
  return evaluateQuota({ lastHourGlobal: global.count ?? 0, lastHourForIp: perIp.count ?? 0 }, limits);
}

export async function recordRun(db: ServerClient, runId: string, ipHash: string): Promise<void> {
  const { error } = await db.from("run_quota").insert({ run_id: runId, client_ip_hash: ipHash });
  if (error) throw new Error(`No se pudo registrar el run en la cuota (${error.message}).`);
}
