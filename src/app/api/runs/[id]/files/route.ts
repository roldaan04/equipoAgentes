import { connection } from "next/server";
import { UUID_RE, jsonError, serverError } from "@/lib/server/http";
import { createServerClient } from "@/lib/supabase/server";
import { FILE_COLUMNS } from "@/lib/supabase/types";

/** Archivos del workspace con su contenido (para el visor de código). */
export async function GET(_request: Request, ctx: RouteContext<"/api/runs/[id]/files">) {
  await connection();
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return jsonError(404, "Run no encontrado.", { code: "not_found" });
  try {
    const { data, error } = await createServerClient().from("files").select(FILE_COLUMNS).eq("run_id", id).order("path");
    if (error) throw new Error(`Supabase (leer archivos): ${error.message}`);
    return Response.json({ files: data }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return serverError(e);
  }
}
