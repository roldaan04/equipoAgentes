// Web semilla: se copia a la tabla `files` al crear cada run.
// Se lee del disco (src/seed/site). En Vercel, next.config.ts incluye esta
// carpeta en la traza de las rutas que la usan (outputFileTracingIncludes).
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { normalizePath } from "../lib/workspace";

export const SEED_DIR = path.join(process.cwd(), "src", "seed", "site");

export type SeedFile = { path: string; content: string };

async function walk(dir: string, prefix = ""): Promise<SeedFile[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: SeedFile[] = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(abs, rel)));
    else if (entry.isFile()) {
      const p = normalizePath(rel);
      if (!p.ok) throw new Error(`Archivo semilla no válido (${rel}): ${p.error}`);
      files.push({ path: p.path, content: await readFile(abs, "utf8") });
    }
  }
  return files;
}

let cache: SeedFile[] | undefined;

/** Archivos de la web semilla, con rutas del workspace ("css/styles.css"). */
export async function loadSeedFiles(dir: string = SEED_DIR): Promise<SeedFile[]> {
  if (dir === SEED_DIR && cache) return cache;
  const files = await walk(dir);
  if (files.length === 0) throw new Error(`La web semilla está vacía (${dir}).`);
  if (dir === SEED_DIR) cache = files;
  return files;
}
