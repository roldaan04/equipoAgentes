// Límites del motor (ver skill motor-agentes).
export const MAX_TASKS = 6;
export const MAX_ATTEMPTS = 3;
export const MAX_DEVELOP_TURNS = 6;

/** Presupuesto de tiempo de un paso (la función de Vercel tiene maxDuration = 60 s). */
export const STEP_BUDGET_MS = 48_000;
/** Develop no empieza un turno nuevo si queda menos que esto. */
export const MIN_TURN_TIME_MS = 14_000;
/** Duración del lock del paso (mayor que maxDuration). */
export const LOCK_SECONDS = 90;

/**
 * Límites de contexto enviado al LLM (caracteres).
 * Los archivos de la web que van en el prompt de Develop se limitan a 8.000 caracteres, primero los
 * que nombra la tarea (`prioritizeFiles`); el resto se lee con read_file. No es la cura de los 503
 * del plan gratuito (las mediciones mostraron que fallan igual con prompts de ~6.000 caracteres:
 * es saturación de Google), pero gasta menos tokens por run.
 */
export const PROMPT_FILES_BUDGET = 8_000;
export const PROMPT_FILE_MAX = 16_000;
