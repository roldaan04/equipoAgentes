import { connection } from "next/server";
import { UUID_RE } from "@/lib/server/http";
import { createServerClient } from "@/lib/supabase/server";
import { contentTypeFor, normalizePath } from "@/lib/workspace";

// La web generada se sirve aislada: solo recursos propios, sin poder enmarcarse
// fuera de la app. En la UI el iframe lleva además sandbox="allow-scripts allow-forms".
const CSP = "default-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'self'; form-action 'self'";

const SECURITY_HEADERS = {
  "Content-Security-Policy": CSP,
  "X-Content-Type-Options": "nosniff",
  "Cache-Control": "no-store",
};

function htmlPage(status: number, title: string, body: string): Response {
  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>${title}</title><style>body{font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem;color:#333}h1{font-size:1.3rem}</style></head><body><h1>${title}</h1><p>${body}</p></body></html>`;
  return new Response(html, { status, headers: { ...SECURITY_HEADERS, "Content-Type": "text/html; charset=utf-8" } });
}

/** Sirve un archivo del workspace del run con su Content-Type. */
export async function GET(_request: Request, ctx: RouteContext<"/preview/[runId]/[[...path]]">) {
  await connection();
  const { runId, path } = await ctx.params;
  if (!UUID_RE.test(runId)) return htmlPage(404, "Vista previa no encontrada", "El identificador del run no es válido.");

  // Sin ruta (o con barra final, que Next elimina): se redirige a index.html para
  // que los enlaces relativos de la web se resuelvan bajo /preview/<id>/.
  if (!path || path.length === 0) {
    return new Response(null, { status: 308, headers: { Location: `/preview/${runId}/index.html` } });
  }

  const requested = path.map((s) => decodeURIComponent(s)).join("/");
  const normalized = normalizePath(requested);
  if (!normalized.ok) return htmlPage(404, "Archivo no encontrado", `«${requested}» no es una ruta válida del workspace.`);

  try {
    const { data, error } = await createServerClient()
      .from("files")
      .select("content")
      .eq("run_id", runId)
      .eq("path", normalized.path)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return htmlPage(404, "Archivo no encontrado", `El archivo «${normalized.path}» no existe en este run.`);
    return new Response(data.content, {
      status: 200,
      headers: { ...SECURITY_HEADERS, "Content-Type": contentTypeFor(normalized.path) },
    });
  } catch (e) {
    return htmlPage(503, "Vista previa no disponible", `No se pudo leer el archivo (${e instanceof Error ? e.message : String(e)}).`);
  }
}

/** Los formularios de la web generada son solo de demostración: no se envían a ningún sitio. */
export async function POST() {
  return htmlPage(
    200,
    "Formulario recibido (vista previa)",
    "Esto es una vista previa: el formulario funciona, pero el mensaje no se envía a ningún sitio. Usa el botón Atrás para volver a la web.",
  );
}
