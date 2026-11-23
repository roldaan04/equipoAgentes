// Interfaz única del LLM: los agentes no saben qué proveedor hay detrás.

/** Herramienta que el modelo puede llamar. `parameters` es JSON Schema (generado desde zod). */
export type ToolDef = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

export type ToolCall = {
  id?: string;
  name: string;
  args: Record<string, unknown>;
};

export type ToolResult = {
  id?: string;
  name: string;
  result: unknown;
};

export type Msg =
  | { role: "user"; text: string }
  /** `raw` guarda el contenido original del proveedor (p. ej. thoughtSignature de Gemini 3) para devolverlo intacto. */
  | { role: "assistant"; toolCalls: ToolCall[]; text?: string; raw?: unknown }
  | { role: "tool"; results: ToolResult[] };

export type Usage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export type CallInput = {
  system: string;
  messages: Msg[];
  tools: ToolDef[];
  /** Obliga a llamar a esta herramienta. Sin él, el modelo debe llamar a alguna de `tools`. */
  forceTool?: string;
  /** Hora límite (epoch ms): ni reintentos ni esperas pueden pasarse de aquí. */
  deadline?: number;
  /**
   * Datos estructurados opcionales del agente que llama. Los proveedores reales
   * los ignoran; el proveedor mock los usa para producir respuestas coherentes.
   */
  meta?: Record<string, unknown>;
};

export type CallOutput = {
  toolCalls: ToolCall[];
  text?: string;
  raw?: unknown;
  usage?: Usage;
};

export interface LLMProvider {
  readonly name: "gemini" | "mock";
  readonly model: string;
  callWithTools(input: CallInput): Promise<CallOutput>;
}

/**
 * El LLM no está disponible ahora mismo (cuota agotada o servicio saturado).
 * NO es un error del run: el engine lo registra y el run se puede reanudar.
 */
export class LLMUnavailableError extends Error {
  constructor(
    public readonly reason: "quota" | "overloaded" | "timeout",
    message: string,
    public readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "LLMUnavailableError";
  }
}

/** Error definitivo del proveedor (petición inválida, clave incorrecta…). */
export class LLMError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "LLMError";
  }
}
