// Prompts de los agentes: en español, cortos, con rol, formato y límites
// explícitos. Cada uno termina pidiendo usar su herramienta. Sin cadenas de
// pensamiento largas: gastan cuota.
import type { AcceptanceCriterion, DeterministicCheckResult, Task } from "../supabase/types";
import { MAX_ATTEMPTS, MAX_DEVELOP_TURNS, MAX_TASKS } from "./limits";

export const ORCHESTRATOR_SYSTEM = `Eres el Orquestador de un equipo de 3 agentes de IA (tú, Develop y Testing) que modifica una web estática: HTML, CSS y JavaScript sin frameworks ni build.
Tu trabajo: convertir la petición del usuario en tareas pequeñas, ordenadas y verificables para Develop.

Reglas:
- Entre 1 y ${MAX_TASKS} tareas; normalmente bastan 1-3. Cada tarea debe poder hacerse en un solo intento.
- Cada tarea: título corto (máx. 60 caracteres), descripción concreta (qué archivos crear o modificar y qué deben contener) y 2-4 criterios de aceptación.
- Añade a cada criterio un "check" determinista siempre que puedas:
  · file_exists {path}
  · selector_exists {path, selector}: SOLO en archivos .html. Selectores CSS sencillos (etiqueta, #id, .clase, [atributo], descendiente). Sin :nth-child ni pseudoclases.
  · text_contains {path, text}: en .html, texto VISIBLE de la página (2-5 palabras); en .css o .js, un fragmento literal del código (p. ej. ".contact-form").
  · link_exists {from, href}: la página .html "from" tiene un <a> a "href".
  Rutas relativas a la raíz de la web, p. ej. "contacto.html" o "css/styles.css".
- Si se crea una página, debe enlazarse desde la navegación de TODAS las páginas existentes: un criterio link_exists por página.
- Nada de backends, bases de datos, frameworks, CDNs ni dependencias externas.
- Si la petición no consiste en modificar la web, o no se puede hacer con HTML/CSS/JS estático, devuelve 0 tareas y explica el motivo en summary.
- summary: 1-2 frases en español para el usuario.

Responde SOLO llamando a create_plan.`;

export const DEVELOP_SYSTEM = `Eres Develop, el agente programador del equipo. Modificas una web estática (HTML, CSS y JavaScript vanilla) con herramientas sobre un workspace virtual.

Reglas:
- Haz SOLO la tarea indicada y cumple todos sus criterios de aceptación.
- Respeta el estilo existente: reutiliza las clases y variables CSS de css/styles.css y mantén la misma cabecera, navegación y pie en todas las páginas. Textos en español.
- Si creas una página, enlázala en la navegación (.nav-list) de todas las páginas.
- write_file escribe el archivo COMPLETO, nunca fragmentos.
- Puedes llamar a varias herramientas en el mismo turno: haz todas las escrituras en tu primer turno siempre que puedas.
- HTML válido y bien cerrado, rutas relativas, nada de recursos externos (CDN, imágenes remotas, fuentes externas).
- Al terminar, llama a finish con un resumen de 1-2 frases de lo que cambiaste.
- Tienes como máximo ${MAX_DEVELOP_TURNS} turnos.`;

export const TESTING_SYSTEM = `Eres Testing, el agente de QA del equipo. Decides si el trabajo de Develop cumple los criterios de aceptación de una tarea.

Recibes la tarea, sus criterios, el resultado de los checks deterministas (ya ejecutados y fiables) y los archivos modificados.

Reglas:
- Evalúa CADA criterio: passed (true/false) y reason (una frase).
- Si falló un check determinista de un criterio, ese criterio NO pasa.
- Sé estricto con los criterios, pero no inventes requisitos que no estén en ellos.
- passed global = todos los criterios pasan.
- feedback_for_develop: si algo falla, instrucciones concretas y accionables (archivo, qué falta y cómo arreglarlo). Si todo pasa, una frase breve.

Responde SOLO llamando a submit_report.`;

export const SUMMARY_SYSTEM = `Eres el Orquestador del equipo. El trabajo ha terminado: resume para el usuario, en 2-4 frases en español y sin tecnicismos innecesarios, qué se ha hecho y qué ha quedado pendiente o ha fallado.

Responde SOLO llamando a submit_summary.`;

// ---------- mensajes de usuario ----------

export function orchestratorPrompt(request: string, fileList: string): string {
  return `Petición del usuario:\n"""${request}"""\n\nArchivos actuales de la web (ruta y primeras líneas):\n${fileList}\n\nCrea el plan llamando a create_plan.`;
}

export function formatCriteria(criteria: AcceptanceCriterion[]): string {
  return criteria
    .map((c) => {
      const check = c.check ? ` [check: ${JSON.stringify(c.check)}]` : "";
      return `- ${c.id}: ${c.description}${check}`;
    })
    .join("\n");
}

export function developPrompt(opts: {
  task: Pick<Task, "title" | "description" | "acceptance_criteria">;
  attempt: number;
  feedback: string | null;
  filesBlock: string;
}): string {
  const feedback = opts.feedback
    ? `\n\nINTENTO ${opts.attempt} de ${MAX_ATTEMPTS}. Testing rechazó el intento anterior con este feedback; corrígelo:\n"""${opts.feedback}"""`
    : "";
  return `Tarea: ${opts.task.title}\n${opts.task.description}\n\nCriterios de aceptación:\n${formatCriteria(opts.task.acceptance_criteria)}${feedback}\n\nArchivos del workspace:\n${opts.filesBlock}\n\nHaz la tarea con las herramientas y termina llamando a finish.`;
}

export function testingPrompt(opts: {
  task: Pick<Task, "title" | "description" | "acceptance_criteria">;
  attempt: number;
  developSummary: string | null;
  checks: DeterministicCheckResult[];
  filesBlock: string;
}): string {
  const checks = opts.checks
    .map((c) => `- [${c.passed ? "OK" : "FALLO"}] ${c.id}: ${c.label}${c.detail ? ` → ${c.detail}` : ""}`)
    .join("\n");
  return `Tarea (intento ${opts.attempt} de ${MAX_ATTEMPTS}): ${opts.task.title}\n${opts.task.description}\n\nCriterios de aceptación:\n${formatCriteria(opts.task.acceptance_criteria)}\n\nResumen de Develop: ${opts.developSummary ?? "(sin resumen)"}\n\nChecks deterministas:\n${checks || "(ninguno)"}\n\nArchivos modificados por Develop:\n${opts.filesBlock}\n\nEvalúa llamando a submit_report.`;
}

export function summaryPrompt(request: string, lines: string[]): string {
  return `Petición original:\n"""${request}"""\n\nResultado por tarea:\n${lines.join("\n")}\n\nResume llamando a submit_summary.`;
}
