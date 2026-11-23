// Reglas de la protección de cuota (puras, sin BD ni Next: testeables).
import { createHash, timingSafeEqual } from "node:crypto";

/** Hash SHA-256 de la IP con sal. Nunca se guarda la IP en claro. */
export function hashIp(ip: string, salt: string): string {
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}

/** IP del cliente detrás del proxy de Vercel (primer valor de x-forwarded-for). */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip")?.trim() || "unknown";
}

export type QuotaDecision = { ok: true } | { ok: false; message: string };

export function evaluateQuota(
  counts: { lastHourGlobal: number; lastHourForIp: number },
  limits: { maxPerHour: number; maxPerIpPerHour: number },
): QuotaDecision {
  if (counts.lastHourGlobal >= limits.maxPerHour) {
    return {
      ok: false,
      message: `La demo ha alcanzado su límite de ${limits.maxPerHour} runs por hora para proteger la cuota gratuita del LLM. Vuelve a intentarlo en un rato o revisa los runs recientes.`,
    };
  }
  if (counts.lastHourForIp >= limits.maxPerIpPerHour) {
    return {
      ok: false,
      message: `Has lanzado ${limits.maxPerIpPerHour} runs en la última hora, el máximo por visitante. Vuelve a intentarlo más tarde.`,
    };
  }
  return { ok: true };
}

/** Comparación en tiempo constante del código de acceso. */
export function accessCodeMatches(expected: string | undefined, given: string | undefined): boolean {
  if (!expected) return true;
  if (!given) return false;
  const a = createHash("sha256").update(expected).digest();
  const b = createHash("sha256").update(given.trim()).digest();
  return timingSafeEqual(a, b);
}
