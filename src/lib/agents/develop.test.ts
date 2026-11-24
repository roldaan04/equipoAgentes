import { describe, expect, it } from "vitest";
import { taskText } from "./develop";
import { PROMPT_FILES_BUDGET } from "./limits";
import { filesBlock, prioritizeFiles } from "./tools";

const file = (path: string, size: number) => ({ path, content: "x".repeat(size) });
// Tamaños parecidos a los de la web semilla (10,8 KB en total).
const seed = [file("carta.html", 2300), file("css/styles.css", 3800), file("index.html", 2700), file("js/main.js", 260), file("nosotros.html", 1800)];

describe("prioritizeFiles", () => {
  it("pone primero los archivos que nombra la tarea, luego el CSS y después el resto (pequeños antes)", () => {
    const ordered = prioritizeFiles(seed, "Añadir testimonios en index.html");
    expect(ordered.map((f) => f.path)).toEqual(["index.html", "css/styles.css", "js/main.js", "nosotros.html", "carta.html"]);
  });

  it("no distingue mayúsculas y no modifica el original", () => {
    const copy = [...seed];
    expect(prioritizeFiles(seed, "Revisar CARTA.HTML")[0]?.path).toBe("carta.html");
    expect(seed).toEqual(copy);
  });
});

describe("filesBlock con el presupuesto del prompt", () => {
  it("la web semilla completa no cabe: se omiten archivos y se avisa de que existen", () => {
    const block = filesBlock(seed);
    expect(block.length).toBeLessThan(PROMPT_FILES_BUDGET + 1_000);
    expect(block).toContain("Sin incluir por tamaño");
  });

  it("una tarea de estilos incluye el CSS y el HTML que nombra, y deja fuera lo demás", () => {
    const task = { title: "Estilos para testimonios", description: "Añadir en css/styles.css y en index.html", acceptance_criteria: [] };
    const block = filesBlock(prioritizeFiles(seed, taskText(task)));
    expect(block).toContain("=== css/styles.css ===");
    expect(block).toContain("=== index.html ===");
    expect(block).toMatch(/Sin incluir por tamaño; usa read_file[^)]*nosotros\.html/);
  });

  it("taskText incluye los criterios y las rutas de sus checks", () => {
    const text = taskText({
      title: "T",
      description: "D",
      acceptance_criteria: [{ id: "c1", description: "Enlace", check: { type: "link_exists", from: "nosotros.html", href: "contacto.html" } }],
    });
    expect(text).toContain("nosotros.html");
    expect(text).toContain("contacto.html");
  });
});
