// npm run llm:check — verifica que LLM_MODEL existe y admite function calling
// con UNA llamada mínima (gasta 1 petición de la cuota). Si el modelo no es
// válido, lista los modelos Flash disponibles. Nunca imprime la clave.
import { ApiError, FunctionCallingConfigMode, GoogleGenAI } from "@google/genai";
import { getServerEnv } from "@/lib/env";

const LITE_HINT =
  "En el plan gratuito solo los modelos «flash-lite» tienen 500 peticiones/día (15/min); los Flash grandes, 20/día (5/min). Recomendado: gemini-3.5-flash-lite.";

async function listFlashModels(ai: GoogleGenAI): Promise<string[]> {
  const names: string[] = [];
  const pager = await ai.models.list({ config: { pageSize: 100 } });
  for await (const model of pager) {
    const name = (model.name ?? "").replace(/^models\//, "");
    const actions = model.supportedActions ?? [];
    if (/flash/i.test(name) && actions.includes("generateContent")) names.push(name);
  }
  return names.sort();
}

async function main() {
  const env = getServerEnv();
  if (env.LLM_PROVIDER !== "gemini" || !env.GEMINI_API_KEY || !env.LLM_MODEL) {
    console.log(`LLM_PROVIDER=${env.LLM_PROVIDER}: no hay nada que comprobar en Gemini.`);
    return;
  }
  const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
  console.log(`Probando el modelo «${env.LLM_MODEL}» con una llamada mínima (function calling forzado)…`);
  const started = Date.now();
  try {
    const res = await ai.models.generateContent({
      model: env.LLM_MODEL,
      contents: [{ role: "user", parts: [{ text: "Responde llamando a la función ping con ok=true." }] }],
      config: {
        tools: [
          {
            functionDeclarations: [
              {
                name: "ping",
                description: "Confirma que el modelo funciona.",
                parametersJsonSchema: {
                  type: "object",
                  properties: { ok: { type: "boolean" } },
                  required: ["ok"],
                },
              },
            ],
          },
        ],
        toolConfig: { functionCallingConfig: { mode: FunctionCallingConfigMode.ANY, allowedFunctionNames: ["ping"] } },
      },
    });
    const call = res.functionCalls?.[0];
    const usage = res.usageMetadata;
    console.log(`  ✓ El modelo responde (${Date.now() - started} ms)`);
    console.log(call ? `  ✓ Function calling: ${call.name}(${JSON.stringify(call.args)})` : "  ✗ No devolvió ninguna llamada a función");
    console.log(`  · Tokens: entrada ${usage?.promptTokenCount ?? "?"}, salida ${usage?.candidatesTokenCount ?? "?"}, razonamiento ${usage?.thoughtsTokenCount ?? 0}`);
    if (!/lite/i.test(env.LLM_MODEL)) console.log(`  ! ${LITE_HINT}`);
    process.exit(call ? 0 : 1);
  } catch (e) {
    if (e instanceof ApiError) {
      console.log(`  ✗ Error ${e.status}: ${e.message.slice(0, 300)}`);
      if (e.status === 429) {
        console.log("  Cuota agotada o demasiadas peticiones por minuto. Espera un poco y vuelve a probar.");
      } else if (e.status === 404 || e.status === 400) {
        console.log("\nModelos Flash disponibles para tu clave (con generateContent):");
        for (const name of await listFlashModels(ai)) console.log(`  - ${name}`);
        console.log(`\n${LITE_HINT}`);
      }
    } else {
      console.log(`  ✗ ${e instanceof Error ? e.message : String(e)}`);
    }
    process.exit(1);
  }
}

void main();
