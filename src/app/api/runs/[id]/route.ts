import { connection } from "next/server";
import { UUID_RE, jsonError, serverError } from "@/lib/server/http";
import { getRunView } from "@/lib/server/run-view";
import { createServerClient } from "@/lib/supabase/server";

/** Run + tareas + informes + eventos + lista de archivos (sin contenido). */
export async function GET(_request: Request, ctx: RouteContext<"/api/runs/[id]">) {
  await connection();
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return jsonError(404, "Run no encontrado.", { code: "not_found" });
  try {
    const view = await getRunView(createServerClient(), id);
    if (!view) return jsonError(404, "Run no encontrado.", { code: "not_found" });
    return Response.json(view, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return serverError(e);
  }
}
