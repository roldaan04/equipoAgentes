import { describe, expect, it } from "vitest";
import { loadSeedFiles } from "../../seed";
import {
  resolveInternalUrl,
  runCriterionCheck,
  runDeterministicChecks,
  runGlobalChecks,
  toFileMap,
  visibleText,
} from "./checks";

const page = (body: string, head = '<link rel="stylesheet" href="css/styles.css">') =>
  `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>T</title>${head}</head><body>${body}</body></html>`;

const site = toFileMap([
  {
    path: "index.html",
    content: page('<nav><a href="index.html">Inicio</a> <a href="./contacto.html#form">Contacto</a></nav><script src="js/main.js"></script>'),
  },
  {
    path: "contacto.html",
    content: page(
      '<h1>Contacto</h1><form id="contact-form"><input name="email" type="email" required><textarea name="msg"></textarea><button type="submit">Enviar mensaje</button></form><script>var oculto = "texto secreto"</script>',
    ),
  },
  { path: "blog/post.html", content: page('<a href="../index.html">Volver</a> <a href="https://example.com">Fuera</a>', '<link rel="stylesheet" href="../css/styles.css">') },
  { path: "css/styles.css", content: "body { color: #333; }" },
  { path: "js/main.js", content: "console.log('ok')" },
]);

describe("resolveInternalUrl", () => {
  it.each([
    ["index.html", "contacto.html", "contacto.html"],
    ["index.html", "./contacto.html#form", "contacto.html"],
    ["index.html", "contacto.html?x=1", "contacto.html"],
    ["blog/post.html", "../index.html", "index.html"],
    ["blog/post.html", "otro.html", "blog/otro.html"],
    ["blog/post.html", "/css/styles.css", "css/styles.css"],
    ["index.html", "./", "index.html"],
    ["index.html", "blog/", "blog/index.html"],
    ["index.html", "mi%20pagina.html", "mi pagina.html"],
  ])("desde %s, %s → %s", (from, url, expected) => {
    expect(resolveInternalUrl(from, url)).toBe(expected);
  });

  it.each(["https://example.com", "//cdn.example.com/x.js", "mailto:a@b.c", "tel:+34910000123", "#form", "javascript:void(0)", "", "?q=1"])(
    "ignora %s",
    (url) => {
      expect(resolveInternalUrl("index.html", url)).toBeNull();
    },
  );
});

describe("runCriterionCheck", () => {
  it("file_exists", () => {
    expect(runCriterionCheck("c1", { type: "file_exists", path: "contacto.html" }, site).passed).toBe(true);
    expect(runCriterionCheck("c1", { type: "file_exists", path: "./css/styles.css" }, site).passed).toBe(true);
    const ko = runCriterionCheck("c1", { type: "file_exists", path: "testimonios.html" }, site);
    expect(ko.passed).toBe(false);
    expect(ko.detail).toContain("testimonios.html");
  });

  it("file_exists rechaza rutas peligrosas sin lanzar", () => {
    const ko = runCriterionCheck("c1", { type: "file_exists", path: "../etc/passwd.txt" }, site);
    expect(ko.passed).toBe(false);
    expect(ko.detail).toMatch(/Ruta no válida/);
  });

  it("selector_exists", () => {
    const sel = (selector: string, path = "contacto.html") =>
      runCriterionCheck("c2", { type: "selector_exists", path, selector }, site);
    expect(sel("form#contact-form").passed).toBe(true);
    expect(sel("input[type=email][required]").passed).toBe(true);
    expect(sel("form button[type='submit']").passed).toBe(true);
    expect(sel("select").passed).toBe(false);
    expect(sel("form", "noexiste.html").passed).toBe(false);
  });

  it("selector_exists con un selector no válido falla con explicación", () => {
    const ko = runCriterionCheck("c2", { type: "selector_exists", path: "contacto.html", selector: "div[" }, site);
    expect(ko.passed).toBe(false);
    expect(ko.detail).toMatch(/Selector no válido/);
  });

  it("text_contains busca en el texto visible, sin distinguir mayúsculas ni espacios", () => {
    const txt = (text: string, path = "contacto.html") =>
      runCriterionCheck("c3", { type: "text_contains", path, text }, site);
    expect(txt("enviar   MENSAJE").passed).toBe(true);
    expect(txt("Contacto").passed).toBe(true);
    expect(txt("texto secreto").passed).toBe(false); // dentro de <script>
    expect(txt("contact-form").passed).toBe(false); // atributo, no visible
    expect(txt("color: #333", "css/styles.css").passed).toBe(true);
    expect(txt("", "contacto.html").passed).toBe(false);
  });

  it("link_exists resuelve rutas relativas y anclas", () => {
    const link = (from: string, href: string) => runCriterionCheck("c4", { type: "link_exists", from, href }, site);
    expect(link("index.html", "contacto.html").passed).toBe(true); // el HTML usa ./contacto.html#form
    expect(link("blog/post.html", "index.html").passed).toBe(false); // relativo a blog/ → blog/index.html
    expect(link("blog/post.html", "../index.html").passed).toBe(true);
    expect(link("blog/post.html", "https://example.com").passed).toBe(true);
    expect(link("index.html", "testimonios.html").passed).toBe(false);
  });
});

describe("runGlobalChecks", () => {
  it("una web correcta pasa todos los checks", () => {
    const results = runGlobalChecks(site);
    expect(results.filter((r) => !r.passed)).toEqual([]);
  });

  it("detecta HTML mal formado", () => {
    const files = toFileMap([{ path: "index.html", content: page("<div><p>sin cerrar</p>") }, { path: "css/styles.css", content: "" }]);
    const ko = runGlobalChecks(files).find((r) => r.id === "global:html:index.html");
    expect(ko?.passed).toBe(false);
  });

  it("detecta enlaces, CSS, JS e imágenes rotos", () => {
    const files = toFileMap([
      {
        path: "index.html",
        content: page(
          '<a href="contacto.html">C</a><img src="img/logo.svg" alt=""><script src="js/app.js"></script>',
          '<link rel="stylesheet" href="css/nuevo.css">',
        ),
      },
    ]);
    const refs = runGlobalChecks(files).find((r) => r.id === "global:refs:index.html");
    expect(refs?.passed).toBe(false);
    expect(refs?.detail).toContain("contacto.html");
    expect(refs?.detail).toContain("css/nuevo.css");
    expect(refs?.detail).toContain("js/app.js");
    expect(refs?.detail).toContain("img/logo.svg");
  });

  it("exige index.html", () => {
    const files = toFileMap([{ path: "otra.html", content: page("x", "") }]);
    expect(runGlobalChecks(files).find((r) => r.id === "global:index")?.passed).toBe(false);
  });
});

describe("runDeterministicChecks", () => {
  it("combina criterios con check y checks globales; los criterios sin check se ignoran", () => {
    const summary = runDeterministicChecks(
      [
        { id: "c1", description: "Existe la página", check: { type: "file_exists", path: "contacto.html" } },
        { id: "c2", description: "Tono amable (lo evalúa el LLM)" },
      ],
      site,
    );
    expect(summary.allPassed).toBe(true);
    expect(summary.results.some((r) => r.id === "c1")).toBe(true);
    expect(summary.results.some((r) => r.id === "c2")).toBe(false);
  });

  it("allPassed es false si falla cualquier check", () => {
    const summary = runDeterministicChecks(
      [{ id: "c1", description: "x", check: { type: "file_exists", path: "nada.html" } }],
      site,
    );
    expect(summary.allPassed).toBe(false);
  });
});

describe("visibleText", () => {
  it("separa bloques y omite scripts y estilos", () => {
    expect(visibleText("<h2>Hola</h2><p>Mundo</p><style>.a{}</style><script>x()</script>")).toBe("hola mundo");
  });
});

describe("web semilla", () => {
  it("se carga y pasa todos los checks globales", async () => {
    const files = await loadSeedFiles();
    const paths = files.map((f) => f.path);
    expect(paths).toEqual(expect.arrayContaining(["index.html", "carta.html", "nosotros.html", "css/styles.css", "js/main.js"]));
    const failed = runGlobalChecks(toFileMap(files)).filter((r) => !r.passed);
    expect(failed).toEqual([]);
  });

  it("todas las páginas enlazan a las demás desde la navegación", async () => {
    const files = toFileMap(await loadSeedFiles());
    for (const from of ["index.html", "carta.html", "nosotros.html"]) {
      for (const href of ["index.html", "carta.html", "nosotros.html"]) {
        expect(runCriterionCheck("nav", { type: "link_exists", from, href }, files).passed).toBe(true);
      }
    }
  });

  it("no incluye todavía lo que piden los ejemplos (contacto, testimonios, hamburguesa)", async () => {
    const files = toFileMap(await loadSeedFiles());
    expect(files.has("contacto.html")).toBe(false);
    expect(files.has("contact.html")).toBe(false);
    expect(visibleText(files.get("index.html") ?? "")).not.toContain("testimonio");
    expect(runCriterionCheck("x", { type: "selector_exists", path: "index.html", selector: ".nav-toggle" }, files).passed).toBe(false);
  });
});
