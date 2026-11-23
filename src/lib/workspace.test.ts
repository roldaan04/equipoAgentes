import { describe, expect, it } from "vitest";
import { MAX_FILE_BYTES, contentTypeFor, headLines, normalizePath, validateWrite } from "./workspace";

describe("normalizePath", () => {
  it.each([
    ["index.html", "index.html"],
    ["./contact.html", "contact.html"],
    ["css/styles.css", "css/styles.css"],
    ["assets/img/logo.svg", "assets/img/logo.svg"],
    ["  about.html  ", "about.html"],
    ["data/team_2024.json", "data/team_2024.json"],
  ])("acepta %s", (input, expected) => {
    expect(normalizePath(input)).toEqual({ ok: true, path: expected });
  });

  it.each([
    ["../secret.html", "salir del workspace"],
    ["css/../../etc.html", ".. en medio"],
    ["/index.html", "ruta absoluta"],
    ["C:/windows.html", "unidad de Windows"],
    ["css\\styles.css", "barra invertida"],
    [".env", "archivo oculto"],
    ["css/.hidden.css", "segmento oculto"],
    ["css//styles.css", "segmento vacío"],
    ["script.php", "extensión no permitida"],
    ["noext", "sin extensión"],
    ["page name.html", "espacios"],
    ["a/b/c/d/e/f.html", "demasiado profunda"],
    ["", "vacía"],
    [`${"a".repeat(250)}.html`, "demasiado larga"],
    ["index.html\u0000.js", "carácter nulo"],
  ])("rechaza %s (%s)", (input) => {
    expect(normalizePath(input).ok).toBe(false);
  });

  it("rechaza valores que no son texto", () => {
    expect(normalizePath(undefined).ok).toBe(false);
    expect(normalizePath(42).ok).toBe(false);
  });
});

describe("validateWrite", () => {
  it("acepta un archivo válido", () => {
    expect(validateWrite("contact.html", "<h1>Hola</h1>")).toEqual({
      ok: true,
      path: "contact.html",
      content: "<h1>Hola</h1>",
    });
  });

  it("rechaza archivos de más de 100 KB (contando bytes UTF-8)", () => {
    expect(validateWrite("big.txt", "a".repeat(MAX_FILE_BYTES)).ok).toBe(true);
    expect(validateWrite("big.txt", "a".repeat(MAX_FILE_BYTES + 1)).ok).toBe(false);
    // "ñ" ocupa 2 bytes: 51.300 caracteres superan los 100 KB.
    expect(validateWrite("big.txt", "ñ".repeat(51_300)).ok).toBe(false);
  });

  it("rechaza contenido que no es texto y rutas peligrosas", () => {
    expect(validateWrite("a.html", { html: "x" }).ok).toBe(false);
    expect(validateWrite("../a.html", "x").ok).toBe(false);
  });
});

describe("contentTypeFor y headLines", () => {
  it("devuelve el Content-Type por extensión", () => {
    expect(contentTypeFor("index.html")).toBe("text/html; charset=utf-8");
    expect(contentTypeFor("css/styles.CSS")).toBe("text/css; charset=utf-8");
    expect(contentTypeFor("logo.svg")).toBe("image/svg+xml");
    expect(contentTypeFor("x.exe")).toBe("application/octet-stream");
  });

  it("recorta a las primeras n líneas", () => {
    expect(headLines("1\n2\r\n3\n4", 2)).toBe("1\n2");
  });
});
