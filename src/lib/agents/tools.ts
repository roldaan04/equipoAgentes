// Herramientas de Develop sobre el workspace virtual. La ejecución real
// (BD o memoria) la inyecta el engine a través de `Workspace`.
import { z } from "zod";
import { toolFromZod } from "../llm/structured";
import type { ToolCall, ToolDef } from "../llm/types";
import { byteLength, normalizePath, validateWrite } from "../workspace";
import { PROMPT_FILE_MAX, PROMPT_FILES_BUDGET } from "./limits";

export interface Workspace {
  list(): Array<{ path: string; bytes: number }>;
  read(path: string): string | undefined;
  write(path: string, content: string): Promise<void>;
  delete(path: string): Promise<boolean>;
}

const PathArgs = z.object({ path: z.string().describe("Ruta relativa, p. ej. 'contacto.html' o 'css/styles.css'") });
const WriteArgs = z.object({
  path: z.string().describe("Ruta relativa del archivo"),
  content: z.string().describe("Contenido COMPLETO del archivo"),
});
const FinishArgs = z.object({ summary: z.string().describe("Qué has cambiado, en 1-2 frases") });

export const DEVELOP_TOOLS: ToolDef[] = [
  toolFromZod("list_files", "Lista los archivos del workspace con su tamaño.", z.object({})),
  toolFromZod("read_file", "Lee el contenido completo de un archivo.", PathArgs),
  toolFromZod("write_file", "Crea o reemplaza un archivo con su contenido COMPLETO.", WriteArgs),
  toolFromZod("delete_file", "Borra un archivo (no se puede borrar index.html).", PathArgs),
  toolFromZod("finish", "Termina la tarea con un resumen de lo hecho.", FinishArgs),
];

export type ToolExecution = {
  result: Record<string, unknown>;
  /** Mensaje legible para la timeline («Escribiendo contacto.html»). null = no se registra. */
  message: string | null;
  touched?: string;
  finished?: { summary: string };
};

/** Ejecuta una llamada de Develop. Nunca lanza por errores del modelo: los devuelve como resultado. */
export async function executeTool(call: ToolCall, ws: Workspace): Promise<ToolExecution> {
  switch (call.name) {
    case "list_files":
      return { result: { files: ws.list() }, message: "Listando archivos" };

    case "read_file": {
      const args = PathArgs.safeParse(call.args);
      if (!args.success) return { result: { error: "Falta 'path'." }, message: null };
      const p = normalizePath(args.data.path);
      if (!p.ok) return { result: { error: p.error }, message: `Ruta rechazada: ${args.data.path}` };
      const content = ws.read(p.path);
      return content === undefined
        ? { result: { error: `No existe ${p.path}.` }, message: `Leyendo ${p.path} (no existe)` }
        : { result: { path: p.path, content }, message: `Leyendo ${p.path}` };
    }

    case "write_file": {
      const args = WriteArgs.safeParse(call.args);
      if (!args.success) return { result: { error: "Faltan 'path' o 'content'." }, message: null };
      const v = validateWrite(args.data.path, args.data.content);
      if (!v.ok) return { result: { error: v.error }, message: `Escritura rechazada: ${args.data.path} (${v.error})` };
      const existed = ws.read(v.path) !== undefined;
      await ws.write(v.path, v.content);
      return {
        result: { ok: true, path: v.path, bytes: byteLength(v.content) },
        message: `${existed ? "Modificando" : "Creando"} ${v.path}`,
        touched: v.path,
      };
    }

    case "delete_file": {
      const args = PathArgs.safeParse(call.args);
      if (!args.success) return { result: { error: "Falta 'path'." }, message: null };
      const p = normalizePath(args.data.path);
      if (!p.ok) return { result: { error: p.error }, message: `Ruta rechazada: ${args.data.path}` };
      if (p.path === "index.html") return { result: { error: "No se puede borrar index.html." }, message: "Intento de borrar index.html (rechazado)" };
      const deleted = await ws.delete(p.path);
      return deleted
        ? { result: { ok: true }, message: `Borrando ${p.path}`, touched: p.path }
        : { result: { error: `No existe ${p.path}.` }, message: null };
    }

    case "finish": {
      const args = FinishArgs.safeParse(call.args);
      const summary = args.success && args.data.summary.trim() ? args.data.summary.trim() : "Tarea terminada.";
      return { result: { ok: true }, message: null, finished: { summary } };
    }

    default:
      return { result: { error: `Herramienta desconocida: ${call.name}` }, message: null };
  }
}

/**
 * Ordena los archivos por relevancia para una tarea: primero los que el texto de la tarea
 * nombra, luego css/styles.css y después el resto (los pequeños antes). Así, con un
 * presupuesto de caracteres corto, lo que se queda fuera es lo menos útil.
 */
export function prioritizeFiles<T extends { path: string; content: string }>(files: ReadonlyArray<T>, taskText: string): T[] {
  const text = taskText.toLowerCase();
  const rank = (f: T) => (text.includes(f.path.toLowerCase()) ? 0 : f.path === "css/styles.css" ? 1 : 2);
  return [...files].sort((a, b) => rank(a) - rank(b) || a.content.length - b.content.length || a.path.localeCompare(b.path));
}

/** Bloque de archivos para un prompt, dentro de un presupuesto de caracteres. */
export function filesBlock(files: ReadonlyArray<{ path: string; content: string }>, budget = PROMPT_FILES_BUDGET): string {
  let used = 0;
  const parts: string[] = [];
  const omitted: string[] = [];
  for (const f of files) {
    const content = f.content.length > PROMPT_FILE_MAX ? `${f.content.slice(0, PROMPT_FILE_MAX)}\n[… recortado]` : f.content;
    if (used + content.length > budget) {
      omitted.push(f.path);
      continue;
    }
    used += content.length;
    parts.push(`=== ${f.path} ===\n${content}`);
  }
  if (omitted.length) parts.push(`(Sin incluir por tamaño; usa read_file si los necesitas: ${omitted.join(", ")})`);
  return parts.join("\n\n") || "(vacío)";
}
