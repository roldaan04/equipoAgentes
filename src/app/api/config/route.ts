import { connection } from "next/server";
import type { ConfigResponse } from "@/lib/api-types";
import { getServerEnv } from "@/lib/env";
import { serverError } from "@/lib/server/http";

/** Configuración pública para la UI (nunca secretos). */
export async function GET() {
  await connection();
  try {
    const env = getServerEnv();
    const body: ConfigResponse = {
      accessCodeRequired: Boolean(env.DEMO_ACCESS_CODE),
      provider: env.LLM_PROVIDER,
      model: env.LLM_PROVIDER === "mock" ? "mock-demo" : (env.LLM_MODEL ?? ""),
    };
    return Response.json(body, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return serverError(e);
  }
}
