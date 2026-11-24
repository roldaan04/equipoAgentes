// Proveedor Gemini (plan gratuito) con el SDK @google/genai y function calling.
import { ApiError, FunctionCallingConfigMode, GoogleGenAI, ThinkingLevel, type Content, type Part } from "@google/genai";
import { createPacer, withRetry, type HttpLikeError } from "./retry";
import { LLMError, LLMUnavailableError, type CallInput, type CallOutput, type LLMProvider, type Msg, type ToolCall } from "./types";

const TIMEOUT_MS = 45_000;
/** ~13 peticiones/minuto como máximo: por debajo del límite gratuito de 15 RPM. */
const MIN_INTERVAL_MS = 4_500;

const pace = createPacer(MIN_INTERVAL_MS);

function toContents(messages: Msg[]): Content[] {
  return messages.map((m): Content => {
    switch (m.role) {
      case "user":
        return { role: "user", parts: [{ text: m.text }] };
      case "assistant":
        // Se devuelve el contenido original (con thoughtSignature) si lo hay.
        if (m.raw && typeof m.raw === "object") return m.raw as Content;
        return {
          role: "model",
          parts: m.toolCalls.map((c): Part => ({ functionCall: { id: c.id, name: c.name, args: c.args } })),
        };
      case "tool":
        return {
          role: "user",
          parts: m.results.map(
            (r): Part => ({
              functionResponse: {
                id: r.id,
                name: r.name,
                response:
                  r.result !== null && typeof r.result === "object" && !Array.isArray(r.result)
                    ? (r.result as Record<string, unknown>)
                    : { result: r.result },
              },
            }),
          ),
        };
    }
  });
}

function toHttpError(e: unknown): HttpLikeError | null {
  if (e instanceof ApiError) {
    let retryAfterSeconds: number | undefined;
    // Gemini indica a veces el retraso en el cuerpo: "retryDelay": "37s"
    const match = /"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/.exec(e.message);
    if (match?.[1]) retryAfterSeconds = Math.ceil(Number(match[1]));
    return { status: e.status, retryAfterSeconds, message: `Gemini ${e.status}: ${e.message.slice(0, 300)}` };
  }
  if (e instanceof Error && (e.name === "AbortError" || /timed? ?out|aborted/i.test(e.message))) {
    return { status: 408, message: "Gemini no respondió a tiempo" };
  }
  if (e instanceof TypeError && /fetch failed/i.test(e.message)) {
    return { status: 503, message: "No se pudo conectar con Gemini" };
  }
  return null;
}

/** Gemini devuelve 400 si el plazo de la petición es menor de 10 s. */
const MIN_HTTP_TIMEOUT_MS = 10_000;

/**
 * Plazo HTTP de una llamada: lo que quede del paso, con tope de TIMEOUT_MS.
 * null = ya no queda tiempo suficiente para hacer la llamada en este paso.
 */
export function httpTimeoutMs(deadline: number | undefined, now: number = Date.now()): number | null {
  if (deadline === undefined) return TIMEOUT_MS;
  const remaining = deadline - now;
  return remaining < MIN_HTTP_TIMEOUT_MS ? null : Math.min(TIMEOUT_MS, remaining);
}

/**
 * ¿Se pide `thinkingLevel: LOW`? Ayuda en los modelos Flash (baja la latencia de 20-40 s a ~10 s),
 * pero en los Flash-Lite lo empeora: medido con gemini-3.1-flash-lite y el prompt real del
 * Orquestador, con LOW tarda 40-52 s (y acaba en 503) y sin él 5-10 s. Los Lite ya
 * razonan poco por defecto, así que con ellos no se envía.
 */
export function wantsThinkingLevel(model: string): boolean {
  return !/lite/i.test(model);
}

export function createGeminiProvider(opts: { apiKey: string; model: string }): LLMProvider {
  const ai = new GoogleGenAI({ apiKey: opts.apiKey });
  let thinkingSupported = wantsThinkingLevel(opts.model);

  return {
    name: "gemini",
    model: opts.model,
    async callWithTools(input: CallInput): Promise<CallOutput> {
      const names = input.forceTool ? [input.forceTool] : input.tools.map((t) => t.name);
      const request = () => {
        const timeout = httpTimeoutMs(input.deadline);
        if (timeout === null) {
          // Gemini rechaza plazos de menos de 10 s (400). No es un fallo: el run sigue en el siguiente paso.
          throw new LLMUnavailableError("timeout", "No queda tiempo en este paso para otra llamada al LLM; continuará en el siguiente.");
        }
        return ai.models.generateContent({
          model: opts.model,
          contents: toContents(input.messages),
          config: {
            systemInstruction: input.system,
            tools: [
              {
                functionDeclarations: input.tools.map((t) => ({
                  name: t.name,
                  description: t.description,
                  parametersJsonSchema: t.parameters,
                })),
              },
            ],
            toolConfig: { functionCallingConfig: { mode: FunctionCallingConfigMode.ANY, allowedFunctionNames: names } },
            temperature: 0.4,
            // Razonamiento bajo: respuestas más rápidas (el paso tiene 60 s) y menos tokens.
            ...(thinkingSupported ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } } : {}),
            httpOptions: { timeout },
          },
        });
      };

      const res = await withRetry(
        async () => {
          await pace(input.deadline);
          try {
            return await request();
          } catch (e) {
            // Si el modelo no admite thinkingLevel, se desactiva y se repite sin él.
            if (thinkingSupported && e instanceof ApiError && e.status === 400 && /thinking/i.test(e.message)) {
              thinkingSupported = false;
              return request();
            }
            throw e;
          }
        },
        toHttpError,
        { deadline: input.deadline },
      );

      const candidate = res.candidates?.[0];
      if (!candidate?.content) {
        const reason = candidate?.finishReason ?? res.promptFeedback?.blockReason ?? "sin contenido";
        throw new LLMError(`Gemini no devolvió respuesta (${reason}).`);
      }
      const toolCalls: ToolCall[] = (res.functionCalls ?? []).map((c) => ({
        id: c.id,
        name: c.name ?? "",
        args: (c.args ?? {}) as Record<string, unknown>,
      }));
      const usage = res.usageMetadata;
      // Texto a mano (sin `res.text`, que avisa por consola si hay llamadas a funciones).
      const text = (candidate.content.parts ?? [])
        .filter((p) => typeof p.text === "string" && !p.thought)
        .map((p) => p.text)
        .join("")
        .trim();
      return {
        toolCalls,
        text: text || undefined,
        raw: candidate.content,
        usage: usage
          ? {
              inputTokens: usage.promptTokenCount ?? 0,
              outputTokens: (usage.candidatesTokenCount ?? 0) + (usage.thoughtsTokenCount ?? 0),
              totalTokens: usage.totalTokenCount ?? 0,
            }
          : undefined,
      };
    },
  };
}
