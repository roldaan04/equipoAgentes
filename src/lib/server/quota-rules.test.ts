import { describe, expect, it } from "vitest";
import { accessCodeMatches, clientIp, evaluateQuota, hashIp } from "./quota-rules";

describe("hashIp", () => {
  it("es determinista, depende de la sal y no contiene la IP", () => {
    const h = hashIp("203.0.113.7", "sal");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).toBe(hashIp("203.0.113.7", "sal"));
    expect(h).not.toBe(hashIp("203.0.113.7", "otra-sal"));
    expect(h).not.toContain("203.0.113.7");
  });
});

describe("clientIp", () => {
  it("toma el primer valor de x-forwarded-for", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }))).toBe("203.0.113.7");
    expect(clientIp(new Headers({ "x-real-ip": "198.51.100.2" }))).toBe("198.51.100.2");
    expect(clientIp(new Headers())).toBe("unknown");
  });
});

describe("evaluateQuota", () => {
  const limits = { maxPerHour: 5, maxPerIpPerHour: 3 };
  it("permite por debajo de los límites", () => {
    expect(evaluateQuota({ lastHourGlobal: 4, lastHourForIp: 2 }, limits)).toEqual({ ok: true });
  });
  it("bloquea al llegar al límite global, con un mensaje claro", () => {
    const d = evaluateQuota({ lastHourGlobal: 5, lastHourForIp: 0 }, limits);
    expect(d.ok).toBe(false);
    expect(!d.ok && d.message).toMatch(/5 runs por hora/);
  });
  it("bloquea al llegar al límite por IP", () => {
    const d = evaluateQuota({ lastHourGlobal: 1, lastHourForIp: 3 }, limits);
    expect(!d.ok && d.message).toMatch(/por visitante/);
  });
});

describe("accessCodeMatches", () => {
  it("sin código configurado, no se exige", () => {
    expect(accessCodeMatches(undefined, undefined)).toBe(true);
  });
  it("con código, exige que coincida", () => {
    expect(accessCodeMatches("secreto", "secreto")).toBe(true);
    expect(accessCodeMatches("secreto", " secreto ")).toBe(true);
    expect(accessCodeMatches("secreto", "otro")).toBe(false);
    expect(accessCodeMatches("secreto", undefined)).toBe(false);
  });
});
