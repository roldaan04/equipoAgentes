// Llamada con salida estructurada: fuerza una herramienta y valida sus
// argumentos con zod. Si no validan, se reintenta UNA vez devolviendo el error al modelo.
import { z } from "zod";
import type { CallInput, LLMProvider, Msg, ToolDef, Usage } from "./types";

/** JSON Schema para una herramienta a partir de un esquema zod. */
export function toolFromZod(name: string, description: string, schema: z.ZodType): ToolDef {
  const json = z.toJSONSchema(schema, { target: "draft-7", unrepresentable: "any" }) as Record<string, unknown>;
  delete json.$schema;
  return { name, description, parameters: json };
}

export function formatZodError(error: z.ZodError): string {
  return error.issues
    .slice(0, 8)
    .map((i) => `${i.path.join(".") || "(raíz)"}: ${i.message}`)
    .join("; ");
}

export function addUsage(a: Usage | undefined, b: Usage | undefined): Usage | undefined {
  if (!a) return b;
  if (!b) return a;
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    totalTokens: a.totalTokens + b.totalTokens,
  };
}

export class InvalidOutputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidOutputError";
  }
}

export async function callStructured<T extends z.ZodType>(
  llm: LLMProvider,
  input: Omit<CallInput, "tools" | "forceTool"> & { tool: { name: string; description: string; schema: T } },
): Promise<{ data: z.infer<T>; usage?: Usage; calls: number }> {
  const tool = toolFromZod(input.tool.name, input.tool.description, input.tool.schema);
  const messages: Msg[] = [...input.messages];
  let usage: Usage | undefined;

  for (let attempt = 0; attempt < 2; attempt++) {
    const out = await llm.callWithTools({ ...input, messages, tools: [tool], forceTool: tool.name });
    usage = addUsage(usage, out.usage);
    const call = out.toolCalls.find((c) => c.name === tool.name);
    const parsed = call ? input.tool.schema.safeParse(call.args) : null;
    if (parsed?.success) return { data: parsed.data, usage, calls: attempt + 1 };

    const problem = parsed ? formatZodError(parsed.error) : `No llamaste a la herramienta ${tool.name}.`;
    if (attempt === 1) throw new InvalidOutputError(`Salida no válida del LLM tras reintentar: ${problem}`);
    messages.push({ role: "assistant", toolCalls: out.toolCalls, text: out.text, raw: out.raw });
    messages.push(
      call
        ? { role: "tool", results: [{ id: call.id, name: call.name, result: { error: `Argumentos no válidos: ${problem}. Vuelve a llamar a ${tool.name} corrigiéndolos.` } }] }
        : { role: "user", text: `${problem} Llama a ${tool.name} con argumentos válidos.` },
    );
  }
  throw new InvalidOutputError("Salida no válida del LLM.");
}
