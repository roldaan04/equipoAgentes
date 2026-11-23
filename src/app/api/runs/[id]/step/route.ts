import { RunNotFoundError, stepWithLock } from "@/lib/agents/engine";
import type { StepResponse } from "@/lib/api-types";
import { getEngineDeps } from "@/lib/server/deps";
import { UUID_RE, jsonError, serverError } from "@/lib/server/http";

// Vercel Hobby: un paso = una acción de un agente, dentro de este límite.
export const maxDuration = 60;

/** Toma el lock, avanza un paso del run y lo libera. 409 si ya hay un paso en curso. */
export async function POST(_request: Request, ctx: RouteContext<"/api/runs/[id]/step">) {
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return jsonError(404, "Run no encontrado.", { code: "not_found" });
  try {
    const result = await stepWithLock(id, getEngineDeps());
    if (!result) return jsonError(409, "Ya hay un paso en curso para este run.", { code: "locked" });
    const body: StepResponse = {
      status: result.status,
      done: result.done,
      quotaExhausted: Boolean(result.paused && result.paused.reason !== "timeout"),
      ...(result.paused ? { paused: result.paused } : {}),
    };
    return Response.json(body, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof RunNotFoundError) return jsonError(404, e.message, { code: "not_found" });
    return serverError(e);
  }
}
