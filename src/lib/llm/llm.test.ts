import { describe, expect, it } from "vitest";
import { z } from "zod";
import { normalizePlan } from "../agents/orchestrator";
import { combineVerdict } from "../agents/testing";
import { createScriptedProvider } from "./mock";
import { createPacer, withRetry, type HttpLikeError } from "./retry";
import { InvalidOutputError, callStructured, toolFromZod } from "./structured";
import { LLMError, LLMUnavailableError } from "./types";

const httpError = (status: number, retryAfterSeconds?: number) => Object.assign(new Error(`HTTP ${status}`), { status, retryAfterSeconds });
const toHttp = (e: unknown): HttpLikeError | null =>
  e instanceof Error && "status" in e ? { status: Number(e.status), retryAfterSeconds: (e as { retryAfterSeconds?: number }).retryAfterSeconds, message: e.message } : null;
const noSleep = async () => {};

describe("withRetry", () => {
  it("reintenta ante 429/503 y acaba devolviendo el resultado", async () => {
    let n = 0;
    const waits: number[] = [];
    const result = await withRetry(
      async () => {
        n++;
        if (n === 1) throw httpError(429);
        if (n === 2) throw httpError(503);
        return "ok";
      },
      toHttp,
      { sleep: async (ms) => void waits.push(ms) },
    );
    expect(result).toBe("ok");
    expect(n).toBe(3);
    expect(waits).toHaveLength(2);
    expect(waits[1]).toBeGreaterThan(waits[0] ?? 0); // backoff exponencial
  });

  it("respeta retry-after", async () => {
    const waits: number[] = [];
    let n = 0;
    await withRetry(async () => (n++ === 0 ? Promise.reject(httpError(429, 7)) : "ok"), toHttp, { sleep: async (ms) => void waits.push(ms) });
    expect(waits).toEqual([7000]);
  });

  it("si retry-after no cabe en el paso, corta con cuota agotada (reanudable)", async () => {
    await expect(withRetry(() => Promise.reject(httpError(429, 60)), toHttp, { sleep: noSleep })).rejects.toMatchObject({
      name: "LLMUnavailableError",
      reason: "quota",
    });
  });

  it("tras 3 reintentos de 5xx devuelve 'saturado'", async () => {
    let n = 0;
    const err = await withRetry(() => (n++, Promise.reject(httpError(503))), toHttp, { sleep: noSleep }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LLMUnavailableError);
    expect((err as LLMUnavailableError).reason).toBe("overloaded");
    expect(n).toBe(4);
  });

  it("no reintenta errores 4xx (salvo 429)", async () => {
    let n = 0;
    await expect(withRetry(() => (n++, Promise.reject(httpError(400))), toHttp, { sleep: noSleep })).rejects.toBeInstanceOf(LLMError);
    expect(n).toBe(1);
  });

  it("no espera más allá de la hora límite del paso", async () => {
    let t = 0;
    await expect(
      withRetry(() => Promise.reject(httpError(503)), toHttp, { sleep: noSleep, now: () => t, deadline: 1500 }),
    ).rejects.toBeInstanceOf(LLMUnavailableError);
    t = 0;
  });
});

describe("createPacer", () => {
  it("espera el intervalo mínimo entre llamadas", async () => {
    let t = 0;
    const waits: number[] = [];
    const pace = createPacer(4500, async (ms) => {
      waits.push(ms);
      t += ms;
    }, () => t);
    await pace();
    t += 1000;
    await pace();
    expect(waits).toEqual([3500]);
  });
});

describe("callStructured", () => {
  const schema = z.object({ n: z.number() });

  it("reintenta una vez devolviendo el error al modelo", async () => {
    const llm = createScriptedProvider((_input, i) => ({ toolCalls: [{ id: "x", name: "give", args: i === 0 ? { n: "dos" } : { n: 2 } }] }));
    const out = await callStructured(llm, { system: "s", messages: [{ role: "user", text: "u" }], tool: { name: "give", description: "d", schema } });
    expect(out.data).toEqual({ n: 2 });
    expect(llm.calls).toHaveLength(2);
    expect(JSON.stringify(llm.calls[1]?.messages)).toContain("Argumentos no válidos");
  });

  it("falla con InvalidOutputError si el segundo intento tampoco valida", async () => {
    const llm = createScriptedProvider(() => ({ toolCalls: [] }));
    await expect(
      callStructured(llm, { system: "s", messages: [{ role: "user", text: "u" }], tool: { name: "give", description: "d", schema } }),
    ).rejects.toBeInstanceOf(InvalidOutputError);
  });

  it("genera JSON Schema sin $schema", () => {
    const t = toolFromZod("give", "d", schema);
    expect(t.parameters).toMatchObject({ type: "object", properties: { n: { type: "number" } } });
    expect(t.parameters).not.toHaveProperty("$schema");
  });
});

describe("normalizePlan", () => {
  it("renumera criterios, descarta checks incompletos o peligrosos y limita a 6 tareas", () => {
    const task = (i: number) => ({
      title: ` T${i} `,
      description: "d",
      acceptance_criteria: [
        { id: "x", description: "ok", check: { type: "file_exists" as const, path: "./a.html" } },
        { description: "sin selector", check: { type: "selector_exists" as const, path: "a.html" } },
        { description: "ruta mala", check: { type: "file_exists" as const, path: "../a.html" } },
        { description: "enlace", check: { type: "link_exists" as const, from: "index.html", href: "a.html" } },
      ],
    });
    const plan = normalizePlan({ summary: " s ", tasks: Array.from({ length: 8 }, (_, i) => task(i)) });
    expect(plan.tasks).toHaveLength(6);
    expect(plan.tasks[0]?.title).toBe("T0");
    expect(plan.tasks[0]?.acceptance_criteria).toEqual([
      { id: "c1", description: "ok", check: { type: "file_exists", path: "a.html" } },
      { id: "c2", description: "sin selector" },
      { id: "c3", description: "ruta mala" },
      { id: "c4", description: "enlace", check: { type: "link_exists", from: "index.html", href: "a.html" } },
    ]);
  });
});

describe("combineVerdict", () => {
  const task = { acceptance_criteria: [{ id: "c1", description: "a" }, { id: "c2", description: "b" }] };

  it("pasa solo si el LLM aprueba y todos los checks deterministas pasan", () => {
    const ok = combineVerdict(task, [{ id: "c1", label: "x", passed: true }], {
      passed: true,
      results: [
        { criterion_id: "c1", passed: true, reason: "ok" },
        { criterion_id: "c2", passed: true, reason: "ok" },
      ],
      feedback_for_develop: "",
    });
    expect(ok.passed).toBe(true);

    const ko = combineVerdict(task, [{ id: "global:refs:index.html", label: "Referencias", passed: false, detail: "enlace roto" }], {
      passed: true,
      results: [],
      feedback_for_develop: "Bien",
    });
    expect(ko.passed).toBe(false);
    expect(ko.feedback).toContain("enlace roto");
  });

  it("un criterio con check fallido no pasa aunque el LLM diga que sí", () => {
    const r = combineVerdict(task, [{ id: "c2", label: "Existe b", passed: false, detail: "No existe b.html" }], {
      passed: true,
      results: [{ criterion_id: "c2", passed: true, reason: "ok" }],
      feedback_for_develop: "",
    });
    expect(r.results.find((x) => x.criterion_id === "c2")).toMatchObject({ passed: false });
    expect(r.passed).toBe(false);
  });
});
