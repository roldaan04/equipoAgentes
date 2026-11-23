// Variables de entorno validadas con zod. Deben coincidir exactamente con .env.example.
// Sin dependencias de Next: lo usan la app, los tests y los scripts de la CLI.
import { z } from "zod";

const emptyToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);

const optionalString = z.preprocess(emptyToUndefined, z.string().optional());
const requiredString = (name: string) =>
  z.preprocess(emptyToUndefined, z.string({ error: `Falta ${name}` }).min(1, `Falta ${name}`));
const positiveInt = (fallback: number) =>
  z.preprocess(emptyToUndefined, z.coerce.number().int().positive().default(fallback));

/** Variables públicas (NEXT_PUBLIC_*): nada aquí puede ser secreto. */
const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.preprocess(
    emptyToUndefined,
    z.url({ error: "Falta NEXT_PUBLIC_SUPABASE_URL o no es una URL válida" }),
  ),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: requiredString("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
});

const serverSchema = publicSchema
  .extend({
    SUPABASE_SECRET_KEY: requiredString("SUPABASE_SECRET_KEY"),
    LLM_PROVIDER: z.preprocess(
      emptyToUndefined,
      z.enum(["gemini", "mock"], { error: "LLM_PROVIDER debe ser 'gemini' o 'mock'" }).default("gemini"),
    ),
    LLM_MODEL: optionalString,
    GEMINI_API_KEY: optionalString,
    IP_HASH_SALT: requiredString("IP_HASH_SALT"),
    MAX_RUNS_PER_HOUR: positiveInt(5),
    MAX_RUNS_PER_IP_PER_HOUR: positiveInt(3),
    DEMO_ACCESS_CODE: optionalString,
  })
  .superRefine((env, ctx) => {
    if (env.LLM_PROVIDER !== "gemini") return;
    if (!env.LLM_MODEL) {
      ctx.addIssue({ code: "custom", path: ["LLM_MODEL"], message: "Falta LLM_MODEL (obligatoria con LLM_PROVIDER=gemini)" });
    }
    if (!env.GEMINI_API_KEY) {
      ctx.addIssue({ code: "custom", path: ["GEMINI_API_KEY"], message: "Falta GEMINI_API_KEY (obligatoria con LLM_PROVIDER=gemini)" });
    }
  });

export type PublicEnv = z.infer<typeof publicSchema>;
export type ServerEnv = z.infer<typeof serverSchema>;

export class EnvError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Configuración incompleta: ${issues.join("; ")}. Revisa .env.local (o las variables en Vercel) frente a .env.example.`);
    this.name = "EnvError";
  }
}

function parse<T extends z.ZodType>(schema: T, source: Record<string, string | undefined>): z.infer<T> {
  const result = schema.safeParse(source);
  if (!result.success) {
    // Solo nombres de variables y mensajes: nunca los valores.
    throw new EnvError(result.error.issues.map((i) => i.message));
  }
  return result.data;
}

export function parseServerEnv(source: Record<string, string | undefined>): ServerEnv {
  return parse(serverSchema, source);
}

export function parsePublicEnv(source: Record<string, string | undefined>): PublicEnv {
  return parse(publicSchema, source);
}

let serverEnvCache: ServerEnv | undefined;

/** Solo en el servidor (o la CLI). Se valida la primera vez que se usa. */
export function getServerEnv(): ServerEnv {
  serverEnvCache ??= parseServerEnv(process.env);
  return serverEnvCache;
}

/**
 * Válido también en el navegador: Next solo inyecta las NEXT_PUBLIC_* si se
 * leen de forma literal (process.env.NEXT_PUBLIC_X), por eso no se pasa process.env entero.
 */
export function getPublicEnv(): PublicEnv {
  return parsePublicEnv({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
}
