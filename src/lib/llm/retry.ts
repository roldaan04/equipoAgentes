// Reintentos con backoff exponencial ante 429/5xx, respetando retry-after y
// la hora límite del paso. Si esperar no cabe en el paso, se corta y el run
// queda reanudable (LLMUnavailableError).
import { LLMError, LLMUnavailableError } from "./types";

export type RetryOptions = {
  maxRetries?: number; // reintentos además del primer intento
  baseDelayMs?: number;
  maxWaitMs?: number; // espera máxima aceptable dentro de un paso
  deadline?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
};

export type HttpLikeError = { status?: number; retryAfterSeconds?: number; message: string };

export const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const isRetryable = (status: number | undefined) =>
  status === 429 || status === 408 || (status !== undefined && status >= 500);

function unavailable(err: HttpLikeError): LLMUnavailableError {
  if (err.status === 429) {
    return new LLMUnavailableError(
      "quota",
      "Se ha agotado la cuota gratuita del LLM (demasiadas peticiones). El run queda en pausa: reanúdalo en un minuto; si persiste, la cuota diaria se renueva mañana o puedes usar LLM_PROVIDER=mock.",
      err.retryAfterSeconds,
    );
  }
  if (err.status === 408) {
    return new LLMUnavailableError("timeout", "El LLM ha tardado demasiado en responder. El run queda en pausa y se puede reanudar.");
  }
  return new LLMUnavailableError(
    "overloaded",
    "El servicio del LLM está saturado o no responde (error temporal del proveedor). El run queda en pausa: reanúdalo en unos minutos.",
    err.retryAfterSeconds,
  );
}

/**
 * Ejecuta `fn` con reintentos. `toHttpError` traduce la excepción del SDK a
 * {status, retryAfterSeconds}; si devuelve null, el error no es reintentable.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  toHttpError: (e: unknown) => HttpLikeError | null,
  opts: RetryOptions = {},
): Promise<T> {
  const { maxRetries = 3, baseDelayMs = 2000, maxWaitMs = 20_000, deadline, sleep = defaultSleep, now = Date.now } = opts;

  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      const err = toHttpError(e);
      if (!err || !isRetryable(err.status)) {
        if (err) throw new LLMError(err.message, err.status);
        throw e;
      }
      if (attempt >= maxRetries) throw unavailable(err);

      const backoff = baseDelayMs * 2 ** attempt + Math.floor(Math.random() * 500);
      const wait = err.retryAfterSeconds !== undefined ? err.retryAfterSeconds * 1000 : backoff;
      const fitsInStep = deadline === undefined || now() + wait < deadline - 1000;
      if (wait > maxWaitMs || !fitsInStep) throw unavailable(err);
      await sleep(wait);
    }
  }
}

/** Espera mínima entre llamadas (planes gratuitos: pocas peticiones por minuto). */
export function createPacer(minIntervalMs: number, sleep = defaultSleep, now: () => number = Date.now) {
  let last: number | undefined;
  return async function pace(deadline?: number): Promise<void> {
    const wait = last === undefined ? 0 : last + minIntervalMs - now();
    if (wait > 0) {
      if (deadline !== undefined && now() + wait > deadline - 2000) {
        throw new LLMUnavailableError("timeout", "No queda tiempo en este paso para otra llamada al LLM; continuará en el siguiente.");
      }
      await sleep(wait);
    }
    last = now();
  };
}
