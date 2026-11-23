// Reglas del workspace virtual: qué rutas y contenidos puede escribir Develop.
// Funciones puras (sin BD): las usan las herramientas de Develop y la vista previa.

export const ALLOWED_EXTENSIONS = [".html", ".css", ".js", ".json", ".svg", ".md", ".txt"] as const;
export const MAX_FILE_BYTES = 100 * 1024;
export const MAX_PATH_LENGTH = 200;
export const MAX_PATH_DEPTH = 5;

const CONTENT_TYPES: Record<(typeof ALLOWED_EXTENSIONS)[number], string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".md": "text/markdown; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

export type PathResult = { ok: true; path: string } | { ok: false; error: string };

const SEGMENT_RE = /^[A-Za-z0-9_-][A-Za-z0-9._-]*$/;

function extensionOf(path: string): string {
  const name = path.slice(path.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot).toLowerCase() : "";
}

function isAllowedExtension(ext: string): ext is (typeof ALLOWED_EXTENSIONS)[number] {
  return (ALLOWED_EXTENSIONS as readonly string[]).includes(ext);
}

/**
 * Normaliza y valida una ruta del workspace. Acepta "./a/b.html" → "a/b.html".
 * Rechaza rutas absolutas, `..`, barras invertidas, unidades de Windows,
 * segmentos ocultos o vacíos, caracteres raros y extensiones no permitidas.
 */
export function normalizePath(input: unknown): PathResult {
  if (typeof input !== "string") return { ok: false, error: "La ruta debe ser un texto." };
  let path = input.trim();
  if (path === "") return { ok: false, error: "La ruta está vacía." };
  if (path.length > MAX_PATH_LENGTH) return { ok: false, error: `La ruta supera ${MAX_PATH_LENGTH} caracteres.` };
  if (path.includes("\\")) return { ok: false, error: "Usa '/' como separador, no '\\'." };
  if (/^[A-Za-z]:/.test(path) || path.startsWith("/")) {
    return { ok: false, error: "Solo se permiten rutas relativas (sin '/' inicial ni unidad)." };
  }
  if (/[\u0000-\u001f]/.test(path)) return { ok: false, error: "La ruta contiene caracteres de control." };

  while (path.startsWith("./")) path = path.slice(2);

  const segments = path.split("/");
  if (segments.length > MAX_PATH_DEPTH) return { ok: false, error: `Máximo ${MAX_PATH_DEPTH} niveles de carpetas.` };
  for (const segment of segments) {
    if (segment === "..") return { ok: false, error: "No se permite '..' en las rutas." };
    if (segment === "" || segment === ".") return { ok: false, error: "La ruta tiene segmentos vacíos." };
    if (!SEGMENT_RE.test(segment)) {
      return {
        ok: false,
        error: `Segmento no válido: '${segment}'. Usa letras, números, '-', '_' y '.' (sin empezar por '.').`,
      };
    }
  }

  const ext = extensionOf(path);
  if (!isAllowedExtension(ext)) {
    return { ok: false, error: `Extensión no permitida. Permitidas: ${ALLOWED_EXTENSIONS.join(" ")}.` };
  }
  return { ok: true, path };
}

export function byteLength(content: string): number {
  return new TextEncoder().encode(content).length;
}

export type WriteValidation = { ok: true; path: string; content: string } | { ok: false; error: string };

/** Valida una escritura completa: ruta + contenido (texto, máximo 100 KB). */
export function validateWrite(path: unknown, content: unknown): WriteValidation {
  const p = normalizePath(path);
  if (!p.ok) return p;
  if (typeof content !== "string") return { ok: false, error: "El contenido debe ser texto." };
  const bytes = byteLength(content);
  if (bytes > MAX_FILE_BYTES) {
    return { ok: false, error: `El archivo ocupa ${Math.ceil(bytes / 1024)} KB; el máximo es ${MAX_FILE_BYTES / 1024} KB.` };
  }
  return { ok: true, path: p.path, content };
}

/** Content-Type para servir el archivo en la vista previa. */
export function contentTypeFor(path: string): string {
  const ext = extensionOf(path);
  return isAllowedExtension(ext) ? CONTENT_TYPES[ext] : "application/octet-stream";
}

/** Primeras `n` líneas de un archivo (para el listado que recibe el Orquestador). */
export function headLines(content: string, n = 15): string {
  return content.split(/\r?\n/).slice(0, n).join("\n");
}
