import { describe, expect, it } from "vitest";
import type { StepResponse } from "@/lib/api-types";
import { AUTO_RESUME_DELAY_S, MAX_AUTO_RESUMES, decideAfterStep } from "./driver-policy";

const step = (over: Partial<StepResponse> = {}): StepResponse => ({ status: "running", done: false, quotaExhausted: false, ...over });
const overloaded = step({ quotaExhausted: true, paused: { reason: "overloaded", message: "Gemini saturado." } });

describe("decideAfterStep", () => {
  it("run terminado: done y contador a cero", () => {
    expect(decideAfterStep(step({ status: "completed", done: true }), 2)).toEqual({ next: { action: "done" }, autoResumes: 0 });
  });

  it("paso normal: continúa y reinicia el contador", () => {
    expect(decideAfterStep(step(), 2)).toEqual({ next: { action: "continue" }, autoResumes: 0 });
  });

  it("saturación: se reanuda sola tras la espera, contando los intentos", () => {
    const first = decideAfterStep(overloaded, 0);
    expect(first.next).toEqual({ action: "auto-resume", attempt: 1, max: MAX_AUTO_RESUMES, delaySeconds: AUTO_RESUME_DELAY_S });
    expect(first.autoResumes).toBe(1);
    expect(decideAfterStep(overloaded, 2).next).toMatchObject({ action: "auto-resume", attempt: 3 });
  });

  it("tras MAX reanudaciones seguidas sin éxito se rinde y pide pulsar Reanudar", () => {
    const out = decideAfterStep(overloaded, MAX_AUTO_RESUMES);
    expect(out.next.action).toBe("pause");
    expect(out.next.action === "pause" && out.next.message).toContain("Gemini saturado.");
    expect(out.next.action === "pause" && out.next.message).toContain(`${MAX_AUTO_RESUMES} veces`);
  });

  it("cuota (429): nunca se reanuda sola, porque puede ser la cuota diaria", () => {
    const quota = step({ quotaExhausted: true, paused: { reason: "quota", message: "Cuota agotada." } });
    expect(decideAfterStep(quota, 0)).toEqual({ next: { action: "pause", message: "Cuota agotada." }, autoResumes: 0 });
  });

  it("«sin tiempo en este paso» no es un fallo: continúa y no toca el contador", () => {
    const timeout = step({ paused: { reason: "timeout", message: "No queda tiempo." } });
    expect(decideAfterStep(timeout, 2)).toEqual({ next: { action: "continue" }, autoResumes: 2 });
  });

  it("un paso bueno entre dos saturaciones reinicia la cuenta", () => {
    const a = decideAfterStep(overloaded, 0);
    const b = decideAfterStep(step(), a.autoResumes);
    expect(decideAfterStep(overloaded, b.autoResumes).next).toMatchObject({ action: "auto-resume", attempt: 1 });
  });
});
