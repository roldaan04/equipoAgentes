// Proveedor mock: respuestas guionizadas y deterministas.
// - createScriptedProvider(): para tests (el test decide cada respuesta).
// - createMockProvider(): para LLM_PROVIDER=mock. Hace una demo creíble sin
//   cuota: entiende las peticiones de ejemplo, escribe HTML válido sobre la web
//   semilla y falla a propósito el primer intento de enlazar la navegación para
//   que se vea el ciclo Develop → Testing → cambios pedidos.
import type { CallInput, CallOutput, LLMProvider, ToolCall } from "./types";

export function createScriptedProvider(
  handler: (input: CallInput, callIndex: number) => CallOutput | Promise<CallOutput>,
  model = "scripted",
): LLMProvider & { calls: CallInput[] } {
  const calls: CallInput[] = [];
  return {
    name: "mock",
    model,
    calls,
    async callWithTools(input) {
      calls.push(input);
      return handler(input, calls.length - 1);
    },
  };
}

// ---------- utilidades HTML para la demo ----------

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const NAV_RE = /(<ul class="nav-list"[^>]*>)([\s\S]*?)(\n?[ \t]*<\/ul>)/;

function addNavLink(html: string, href: string, label: string): string {
  const match = NAV_RE.exec(html);
  if (!match || match[2]?.includes(`href="${href}"`)) return html;
  return html.replace(NAV_RE, `$1$2\n          <li><a href="${href}">${label}</a></li>$3`);
}

function makePage(base: string, title: string, href: string, label: string, main: string): string {
  let html = base
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${title} · Horno Alba</title>`)
    .replace(/ aria-current="page"/g, "")
    .replace(/<main>[\s\S]*<\/main>/, `<main>\n${main}\n  </main>`);
  html = addNavLink(html, href, label);
  return html.replace(`<a href="${href}">`, `<a href="${href}" aria-current="page">`);
}

const CONTACT_MAIN = `    <section class="page-header">
      <div class="container">
        <h1>Contacto</h1>
        <p class="lead">Escríbenos para encargos, tartas por encargo o cualquier duda.</p>
      </div>
    </section>

    <section class="section">
      <div class="container two-cols">
        <form class="card contact-form" action="#" method="post">
          <p><label for="nombre">Nombre</label><br><input id="nombre" name="nombre" type="text" required></p>
          <p><label for="email">Email</label><br><input id="email" name="email" type="email" required></p>
          <p><label for="mensaje">Mensaje</label><br><textarea id="mensaje" name="mensaje" rows="5" required></textarea></p>
          <button class="button" type="submit">Enviar mensaje</button>
        </form>
        <div>
          <h2>Visítanos</h2>
          <p>Calle del Trigo, 12<br>28012 Madrid</p>
          <p>Teléfono: 910 000 123</p>
        </div>
      </div>
    </section>`;

const TESTIMONIALS = `
    <section class="section" id="testimonios">
      <div class="container">
        <h2>Lo que dicen nuestros clientes</h2>
        <div class="cards">
          <blockquote class="card"><p>«La mejor hogaza del barrio, sin discusión.»</p><p>— Marta G.</p></blockquote>
          <blockquote class="card"><p>«Los croissants de los sábados ya son tradición en casa.»</p><p>— Luis P.</p></blockquote>
          <blockquote class="card"><p>«Encargamos la tarta de cumpleaños y fue un éxito.»</p><p>— Ana R.</p></blockquote>
        </div>
      </div>
    </section>
`;

const TOGGLE_BUTTON = `<button class="nav-toggle" type="button" aria-expanded="false" aria-controls="menu-principal" aria-label="Abrir menú">☰</button>\n      `;
const TOGGLE_CSS = `
/* Menú hamburguesa */
.nav-toggle { display: none; background: none; border: 1px solid var(--color-border); border-radius: 8px; font-size: 1.4rem; padding: 0.2rem 0.6rem; cursor: pointer; }
@media (max-width: 600px) {
  .header-inner { flex-direction: row; flex-wrap: wrap; align-items: center; }
  .nav-toggle { display: block; }
  .site-nav { width: 100%; }
  .nav-list { display: none; flex-direction: column; padding-bottom: 0.75rem; }
  .nav-list.is-open { display: flex; }
}
`;
const TOGGLE_JS = `
// Menú hamburguesa
document.addEventListener("DOMContentLoaded", function () {
  var toggle = document.querySelector(".nav-toggle");
  var list = document.getElementById("menu-principal");
  if (!toggle || !list) return;
  toggle.addEventListener("click", function () {
    var open = list.classList.toggle("is-open");
    toggle.setAttribute("aria-expanded", String(open));
  });
});
`;

const PAGES = ["index.html", "carta.html", "nosotros.html"];

type Scenario = "contact" | "testimonials" | "hamburger" | "generic";

function scenarioFor(request: string): Scenario {
  const r = request.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (/contact/.test(r)) return "contact";
  if (/testimoni|opinion|resena/.test(r)) return "testimonials";
  if (/hamburguesa|responsive|menu movil/.test(r)) return "hamburger";
  return "generic";
}

const TITLES = {
  contactPage: "Crear la página de contacto",
  contactNav: "Enlazar Contacto en la navegación",
  testimonials: "Añadir la sección de testimonios",
  hamburger: "Menú responsive con botón hamburguesa",
  generic: "Añadir un aviso destacado en la portada",
} as const;

function plan(request: string) {
  switch (scenarioFor(request)) {
    case "contact":
      return {
        summary: "Crearé una página de contacto con formulario y la enlazaré desde la navegación de todas las páginas.",
        tasks: [
          {
            title: TITLES.contactPage,
            description: "Crear contacto.html con la misma cabecera y pie que el resto, un formulario (nombre, email, mensaje) y los datos de la tienda.",
            acceptance_criteria: [
              { description: "Existe la página contacto.html", check: { type: "file_exists", path: "contacto.html" } },
              { description: "Tiene un formulario", check: { type: "selector_exists", path: "contacto.html", selector: "form" } },
              { description: "Pide el email", check: { type: "selector_exists", path: "contacto.html", selector: "input[type=email]" } },
              { description: "Invita a escribir", check: { type: "text_contains", path: "contacto.html", text: "Escríbenos" } },
            ],
          },
          {
            title: TITLES.contactNav,
            description: "Añadir el enlace «Contacto» a la navegación (.nav-list) de index.html, carta.html y nosotros.html.",
            acceptance_criteria: PAGES.map((p) => ({
              description: `${p} enlaza a contacto.html`,
              check: { type: "link_exists", from: p, href: "contacto.html" },
            })),
          },
        ],
      };
    case "testimonials":
      return {
        summary: "Añadiré a la portada una sección de testimonios con tres opiniones de clientes.",
        tasks: [
          {
            title: TITLES.testimonials,
            description: "Añadir en index.html, antes del cierre de <main>, una sección #testimonios con tres citas (blockquote) usando las clases existentes.",
            acceptance_criteria: [
              { description: "Existe la sección", check: { type: "selector_exists", path: "index.html", selector: "section#testimonios" } },
              { description: "Incluye citas", check: { type: "selector_exists", path: "index.html", selector: "#testimonios blockquote" } },
              { description: "Tiene un título claro", check: { type: "text_contains", path: "index.html", text: "Lo que dicen" } },
            ],
          },
        ],
      };
    case "hamburger":
      return {
        summary: "Haré el menú responsive: botón hamburguesa en móvil que abre y cierra la navegación.",
        tasks: [
          {
            title: TITLES.hamburger,
            description: "Añadir un botón .nav-toggle en la cabecera de todas las páginas, estilos para ocultar el menú en móvil y JS para abrirlo y cerrarlo.",
            acceptance_criteria: [
              ...PAGES.map((p) => ({
                description: `${p} tiene el botón`,
                check: { type: "selector_exists", path: p, selector: "button.nav-toggle" },
              })),
              { description: "Hay estilos para el botón", check: { type: "text_contains", path: "css/styles.css", text: ".nav-toggle" } },
              { description: "El JS abre y cierra el menú", check: { type: "text_contains", path: "js/main.js", text: "nav-toggle" } },
            ],
          },
        ],
      };
    case "generic":
      return {
        summary: "Añadiré en la portada un aviso destacado con lo que has pedido.",
        tasks: [
          {
            title: TITLES.generic,
            description: "Añadir en index.html, justo después del hero, una sección .aviso con el texto de la petición.",
            acceptance_criteria: [
              { description: "Existe el aviso", check: { type: "selector_exists", path: "index.html", selector: "section.aviso" } },
              { description: "Se presenta como novedad", check: { type: "text_contains", path: "index.html", text: "Novedad" } },
            ],
          },
        ],
      };
  }
}

function developWrites(title: string, files: Record<string, string>, hasFeedback: boolean, request: string): Array<{ path: string; content: string }> {
  const get = (p: string) => files[p] ?? "";
  switch (title) {
    case TITLES.contactPage:
      return [{ path: "contacto.html", content: makePage(get("nosotros.html") || get("index.html"), "Contacto", "contacto.html", "Contacto", CONTACT_MAIN) }];
    case TITLES.contactNav: {
      // Primer intento: se "olvida" nosotros.html (demo del ciclo de cambios).
      const pages = hasFeedback ? PAGES : PAGES.filter((p) => p !== "nosotros.html");
      return pages.filter((p) => files[p]).map((p) => ({ path: p, content: addNavLink(get(p), "contacto.html", "Contacto") }));
    }
    case TITLES.testimonials:
      return [{ path: "index.html", content: get("index.html").replace(/\n\s*<\/main>/, `\n${TESTIMONIALS}  </main>`) }];
    case TITLES.hamburger:
      return [
        ...PAGES.filter((p) => files[p]).map((p) => ({
          path: p,
          content: get(p)
            .replace('<nav class="site-nav"', `${TOGGLE_BUTTON}<nav class="site-nav"`)
            .replace('<ul class="nav-list">', '<ul class="nav-list" id="menu-principal">'),
        })),
        { path: "css/styles.css", content: get("css/styles.css") + TOGGLE_CSS },
        { path: "js/main.js", content: get("js/main.js") + TOGGLE_JS },
      ];
    default: {
      const aviso = `\n    <section class="section aviso">\n      <div class="container card">\n        <p class="eyebrow">Novedad</p>\n        <p>${escapeHtml(request.slice(0, 200))}</p>\n      </div>\n    </section>\n`;
      return [{ path: "index.html", content: get("index.html").replace(/(<\/section>)/, `$1\n${aviso}`) }];
    }
  }
}

type MetaTask = { title?: string; acceptance_criteria?: Array<{ id: string }> };
type MetaCheck = { id: string; passed: boolean; label: string; detail?: string };

let callSeq = 0;
const call = (name: string, args: Record<string, unknown>): ToolCall => ({ id: `mock-${++callSeq}`, name, args });

export function createMockProvider(opts: { delayMs?: number } = {}): LLMProvider {
  const delayMs = opts.delayMs ?? 700;
  let lastRequest = "";

  return {
    name: "mock",
    model: "mock-demo",
    async callWithTools(input: CallInput): Promise<CallOutput> {
      if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
      const meta = input.meta ?? {};
      const usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };

      switch (meta.agent) {
        case "orchestrator": {
          lastRequest = String(meta.request ?? "");
          return { toolCalls: [call("create_plan", plan(lastRequest))], usage };
        }
        case "develop": {
          const task = (meta.task ?? {}) as MetaTask;
          if (Number(meta.turn ?? 1) > 1) {
            return { toolCalls: [call("finish", { summary: `He completado «${task.title ?? "la tarea"}».` })], usage };
          }
          const writes = developWrites(task.title ?? "", (meta.files ?? {}) as Record<string, string>, Boolean(meta.feedback), lastRequest);
          return { toolCalls: writes.map((w) => call("write_file", w)), usage };
        }
        case "testing": {
          const task = (meta.task ?? {}) as MetaTask;
          const checks = (meta.deterministic ?? []) as MetaCheck[];
          const failed = checks.filter((c) => !c.passed);
          const results = (task.acceptance_criteria ?? []).map((c) => {
            const f = failed.find((x) => x.id === c.id);
            return { criterion_id: c.id, passed: !f, reason: f ? `No se cumple: ${f.detail ?? f.label}` : "Cumplido." };
          });
          return {
            toolCalls: [
              call("submit_report", {
                passed: failed.length === 0,
                results,
                feedback_for_develop: failed.length === 0 ? "Todo correcto." : `Corrige: ${failed.map((f) => f.detail ?? f.label).join("; ")}`,
              }),
            ],
            usage,
          };
        }
        case "summary": {
          const tasks = (meta.tasks ?? []) as Array<{ title: string; status: string }>;
          const done = tasks.filter((t) => t.status === "done").length;
          return {
            toolCalls: [
              call("submit_summary", {
                summary: `El equipo ha completado ${done} de ${tasks.length} tareas (modo demo, sin LLM real). Revisa la vista previa para ver los cambios en la web.`,
              }),
            ],
            usage,
          };
        }
        default:
          return { toolCalls: input.forceTool ? [call(input.forceTool, {})] : [], usage };
      }
    },
  };
}
