import "server-only";
import { EnvError } from "@/lib/env";

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function jsonError(status: number, error: string, extra?: Record<string, unknown>): Response {
  return Response.json({ error, ...extra }, { status, headers: { "Cache-Control": "no-store" } });
}

/** Respuesta 500 con un mensaje útil (nunca secretos: EnvError solo nombra variables). */
export function serverError(e: unknown): Response {
  const message = e instanceof Error ? e.message : String(e);
  console.error("[api]", message);
  if (e instanceof EnvError) return jsonError(500, e.message, { code: "config" });
  if (/fetch failed|ECONNREFUSED|ENOTFOUND/i.test(message)) {
    return jsonError(503, "No se puede conectar con la base de datos. Si es un proyecto gratuito de Supabase, comprueba que no esté pausado.", {
      code: "db_unavailable",
    });
  }
  return jsonError(500, message);
}
