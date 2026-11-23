import { connection } from "next/server";
import { z } from "zod";
import { createRun } from "@/lib/agents/engine";
import { createSupabaseStore } from "@/lib/agents/store-supabase";
import { REQUEST_MAX, REQUEST_MIN, type CreateRunResponse } from "@/lib/api-types";
import { getServerEnv } from "@/lib/env";
import { jsonError, serverError } from "@/lib/server/http";
import { checkQuota, recordRun } from "@/lib/server/quota";
import { accessCodeMatches, clientIp, hashIp } from "@/lib/server/quota-rules";
import { listRecentRuns } from "@/lib/server/run-view";
import { createServerClient } from "@/lib/supabase/server";
import { loadSeedFiles } from "@/seed";

const Body = z.object({
  request: z
    .string({ error: "Escribe una petición." })
    .trim()
    .min(REQUEST_MIN, `La petición debe tener al menos ${REQUEST_MIN} caracteres.`)
    .max(REQUEST_MAX, `La petición no puede superar los ${REQUEST_MAX} caracteres.`),
  accessCode: z.string().max(200).optional(),
});

/** Crea un run: valida, aplica la protección de cuota y copia la web semilla. */
export async function POST(request: Request) {
  try {
    const env = getServerEnv();
    const json: unknown = await request.json().catch(() => null);
    const body = Body.safeParse(json);
    if (!body.success) return jsonError(400, body.error.issues[0]?.message ?? "Petición no válida.", { code: "invalid" });

    if (!accessCodeMatches(env.DEMO_ACCESS_CODE, body.data.accessCode)) {
      return jsonError(401, "El código de acceso no es correcto.", { code: "access_code" });
    }

    const db = createServerClient();
    const ipHash = hashIp(clientIp(request.headers), env.IP_HASH_SALT);
    const quota = await checkQuota(db, ipHash, {
      maxPerHour: env.MAX_RUNS_PER_HOUR,
      maxPerIpPerHour: env.MAX_RUNS_PER_IP_PER_HOUR,
    });
    if (!quota.ok) return jsonError(429, quota.message, { code: "rate_limited" });

    const run = await createRun(createSupabaseStore(db), body.data.request, await loadSeedFiles());
    await recordRun(db, run.id, ipHash);
    return Response.json({ id: run.id } satisfies CreateRunResponse, { status: 201 });
  } catch (e) {
    return serverError(e);
  }
}

/** Últimos 20 runs (columnas explícitas). */
export async function GET() {
  await connection();
  try {
    const runs = await listRecentRuns(createServerClient());
    return Response.json({ runs }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return serverError(e);
  }
}
