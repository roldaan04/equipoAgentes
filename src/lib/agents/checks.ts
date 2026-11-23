// Checks deterministas de Testing (capa 1, sin LLM). Funciones puras sobre un
// mapa ruta → contenido del workspace. Si alguno falla, la tarea no pasa.
import { parse, valid, type HTMLElement } from "node-html-parser";
import type { AcceptanceCriterion, CriterionCheck, DeterministicCheckResult } from "../supabase/types";
import { normalizePath } from "../workspace";

export type FileMap = ReadonlyMap<string, string>;

export function toFileMap(files: ReadonlyArray<{ path: string; content: string }>): FileMap {
  return new Map(files.map((f) => [f.path, f.content]));
}

// ---------- utilidades ----------

const isHtml = (path: string) => path.toLowerCase().endsWith(".html");

const collapse = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

function parseHtml(content: string): HTMLElement {
  return parse(content, { comment: false });
}

/** Texto visible de un HTML (sin <script> ni <style>), con espacios normalizados. */
export function visibleText(html: string): string {
  const root = parseHtml(html);
  root.querySelectorAll("script, style, noscript, template").forEach((n) => n.remove());
  return collapse(root.structuredText);
}

/** Primer elemento que casa con el selector, o un error si el selector no es válido. */
function selectSafe(root: HTMLElement, selector: string): { el: HTMLElement | null; error?: string } {
  if (selector.trim() === "") return { el: null, error: "Selector vacío." };
  try {
    return { el: root.querySelector(selector) };
  } catch (e) {
    return { el: null, error: `Selector no válido «${selector}»: ${e instanceof Error ? e.message : String(e)}` };
  }
}

const EXTERNAL_RE = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i; // http:, https:, mailto:, tel:, data:, javascript:, //cdn…

/**
 * Resuelve una URL de un archivo del workspace a una ruta del workspace.
 * Devuelve null si es externa, un ancla o vacía (no se comprueba).
 */
export function resolveInternalUrl(fromPath: string, url: string): string | null {
  const raw = url.trim();
  if (raw === "" || raw.startsWith("#") || EXTERNAL_RE.test(raw)) return null;
  const withoutHash = raw.split("#")[0] ?? "";
  const clean = (withoutHash.split("?")[0] ?? "").trim();
  if (clean === "") return null; // solo query: misma página

  let decoded: string;
  try {
    decoded = decodeURIComponent(clean);
  } catch {
    decoded = clean;
  }

  const baseSegments = decoded.startsWith("/") ? [] : fromPath.split("/").slice(0, -1);
  const segments = [...baseSegments];
  for (const part of decoded.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") segments.pop();
    else segments.push(part);
  }
  let resolved = segments.join("/");
  if (decoded.endsWith("/") || resolved === "") resolved = resolved ? `${resolved}/index.html` : "index.html";
  return resolved;
}

function fileExists(files: FileMap, path: string): boolean {
  return files.has(path);
}

/** Normaliza la ruta de un check; si no es válida, devuelve el error como resultado fallido. */
function checkPath(path: string): { ok: true; path: string } | { ok: false; detail: string } {
  const p = normalizePath(path);
  return p.ok ? p : { ok: false, detail: `Ruta no válida «${path}»: ${p.error}` };
}

// ---------- checks de criterios ----------

export function describeCheck(check: CriterionCheck): string {
  switch (check.type) {
    case "file_exists":
      return `Existe ${check.path}`;
    case "selector_exists":
      return `${check.path} contiene «${check.selector}»`;
    case "text_contains":
      return `${check.path} incluye el texto «${check.text}»`;
    case "link_exists":
      return `${check.from} enlaza a ${check.href}`;
  }
}

/** Ejecuta el check determinista de un criterio de aceptación. */
export function runCriterionCheck(id: string, check: CriterionCheck, files: FileMap): DeterministicCheckResult {
  const label = describeCheck(check);
  const result = (passed: boolean, detail?: string): DeterministicCheckResult =>
    detail === undefined ? { id, label, passed } : { id, label, passed, detail };

  const path = checkPath(check.type === "link_exists" ? check.from : check.path);
  if (!path.ok) return result(false, path.detail);
  const content = files.get(path.path);

  switch (check.type) {
    case "file_exists":
      return content !== undefined ? result(true) : result(false, `No existe el archivo ${path.path}.`);

    case "selector_exists": {
      if (content === undefined) return result(false, `No existe el archivo ${path.path}.`);
      const { el, error } = selectSafe(parseHtml(content), check.selector);
      if (error) return result(false, error);
      return el ? result(true) : result(false, `Ningún elemento de ${path.path} casa con «${check.selector}».`);
    }

    case "text_contains": {
      if (content === undefined) return result(false, `No existe el archivo ${path.path}.`);
      const haystack = isHtml(path.path) ? visibleText(content) : collapse(content);
      const needle = collapse(check.text);
      if (needle === "") return result(false, "El texto a buscar está vacío.");
      return haystack.includes(needle)
        ? result(true)
        : result(false, `El texto «${check.text}» no aparece${isHtml(path.path) ? " en el contenido visible" : ""} de ${path.path}.`);
    }

    case "link_exists": {
      if (content === undefined) return result(false, `No existe el archivo ${path.path}.`);
      const target = EXTERNAL_RE.test(check.href.trim())
        ? check.href.trim()
        : resolveInternalUrl(path.path, check.href);
      const anchors = parseHtml(content).querySelectorAll("a[href]");
      const found = anchors.some((a) => {
        const href = a.getAttribute("href") ?? "";
        if (target === null) return href.trim() === check.href.trim();
        return EXTERNAL_RE.test(target) ? href.trim() === target : resolveInternalUrl(path.path, href) === target;
      });
      return found ? result(true) : result(false, `${path.path} no tiene ningún <a> que apunte a ${check.href}.`);
    }
  }
}

// ---------- checks globales ----------

/** Referencias internas de un HTML: enlaces, hojas de estilo, scripts e imágenes. */
function internalReferences(path: string, root: HTMLElement): Array<{ kind: string; url: string; target: string }> {
  const refs: Array<{ kind: string; url: string; target: string }> = [];
  const add = (kind: string, url: string | undefined) => {
    if (url === undefined) return;
    const target = resolveInternalUrl(path, url);
    if (target !== null) refs.push({ kind, url, target });
  };
  root.querySelectorAll("a[href]").forEach((el) => add("enlace", el.getAttribute("href")));
  root.querySelectorAll("link[href]").forEach((el) => {
    const rel = (el.getAttribute("rel") ?? "").toLowerCase();
    if (rel.includes("stylesheet") || rel.includes("icon")) add("CSS", el.getAttribute("href"));
  });
  root.querySelectorAll("script[src]").forEach((el) => add("JS", el.getAttribute("src")));
  root.querySelectorAll("img[src]").forEach((el) => add("imagen", el.getAttribute("src")));
  return refs;
}

/**
 * Checks que se aplican a toda la web en cada evaluación:
 * HTML bien formado y referencias internas (enlaces, CSS, JS, imágenes) que existen.
 */
export function runGlobalChecks(files: FileMap): DeterministicCheckResult[] {
  const results: DeterministicCheckResult[] = [];
  const htmlPaths = [...files.keys()].filter(isHtml).sort();

  if (!files.has("index.html")) {
    results.push({ id: "global:index", label: "Existe index.html", passed: false, detail: "La web no tiene index.html." });
  }

  for (const path of htmlPaths) {
    const content = files.get(path) ?? "";
    const wellFormed = valid(content);
    results.push(
      wellFormed
        ? { id: `global:html:${path}`, label: `${path} es HTML bien formado`, passed: true }
        : {
            id: `global:html:${path}`,
            label: `${path} es HTML bien formado`,
            passed: false,
            detail: "Hay etiquetas sin cerrar o mal anidadas.",
          },
    );

    const broken = internalReferences(path, parseHtml(content)).filter((r) => !fileExists(files, r.target));
    const unique = [...new Map(broken.map((b) => [`${b.kind}:${b.target}`, b])).values()];
    results.push(
      unique.length === 0
        ? { id: `global:refs:${path}`, label: `Referencias internas de ${path}`, passed: true }
        : {
            id: `global:refs:${path}`,
            label: `Referencias internas de ${path}`,
            passed: false,
            detail: unique.map((b) => `${b.kind} roto: ${b.url} (no existe ${b.target})`).join("; "),
          },
    );
  }
  return results;
}

// ---------- agregado ----------

export type DeterministicSummary = { results: DeterministicCheckResult[]; allPassed: boolean };

/** Checks de los criterios (los que tienen `check`) + checks globales. */
export function runDeterministicChecks(criteria: ReadonlyArray<AcceptanceCriterion>, files: FileMap): DeterministicSummary {
  const results = [
    ...criteria.flatMap((c) => (c.check ? [runCriterionCheck(c.id, c.check, files)] : [])),
    ...runGlobalChecks(files),
  ];
  return { results, allPassed: results.every((r) => r.passed) };
}
