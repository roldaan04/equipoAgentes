// Qué hace el driver de pasos tras cada respuesta de POST /api/runs/[id]/step.
// Función pura (sin React) para poder testearla.
import type { StepResponse } from "@/lib/api-types";

/** Espera antes de reanudar solo tras un 503: las ráfagas de saturación de Gemini duran segundos. */
export const AUTO_RESUME_DELAY_S = 20;
/** Reanudaciones automáticas seguidas, sin ningún paso completado entre medias, antes de rendirse. */
export const MAX_AUTO_RESUMES = 3;

export type AfterStep =
  | { action: "done" }
  | { action: "continue" }
  /** Saturación temporal: esperar `delaySeconds` y seguir solo. `attempt` va de 1 a `max`. */
  | { action: "auto-resume"; attempt: number; max: number; delaySeconds: number }
  /** Pausa manual: hay que pulsar Reanudar. */
  | { action: "pause"; message: string };

/**
 * Decide qué hacer tras un paso. `autoResumes` es el número de reanudaciones automáticas
 * seguidas hasta ahora; devuelve también su nuevo valor.
 *
 * - Saturación (503/5xx, `overloaded`): se reanuda sola hasta MAX_AUTO_RESUMES veces.
 * - Cuota (429, `quota`): NO se reanuda sola, porque puede ser la cuota diaria y reintentar
 *   gastaría peticiones para nada. Se pausa con el motivo.
 * - «Sin tiempo en este paso» (`timeout`): no es un fallo, se sigue con el paso siguiente.
 * - Un paso completado sin pausa reinicia el contador.
 */
export function decideAfterStep(data: StepResponse, autoResumes: number): { next: AfterStep; autoResumes: number } {
  if (data.done) return { next: { action: "done" }, autoResumes: 0 };

  if (data.quotaExhausted) {
    const message = data.paused?.message ?? "El LLM no está disponible ahora mismo.";
    if (data.paused?.reason === "overloaded") {
      if (autoResumes < MAX_AUTO_RESUMES) {
        const attempt = autoResumes + 1;
        return {
          next: { action: "auto-resume", attempt, max: MAX_AUTO_RESUMES, delaySeconds: AUTO_RESUME_DELAY_S },
          autoResumes: attempt,
        };
      }
      return {
        next: { action: "pause", message: `${message} Se reintentó ${MAX_AUTO_RESUMES} veces sin éxito: pulsa Reanudar dentro de unos minutos.` },
        autoResumes,
      };
    }
    return { next: { action: "pause", message }, autoResumes };
  }

  // Sin pausa: el paso avanzó, se reinicia el contador. Con pausa «timeout» no se toca.
  return { next: { action: "continue" }, autoResumes: data.paused ? autoResumes : 0 };
}
