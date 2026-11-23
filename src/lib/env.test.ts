import { describe, expect, it } from "vitest";
import { EnvError, parseServerEnv } from "./env";

const base = {
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "pk",
  SUPABASE_SECRET_KEY: "sk",
  LLM_PROVIDER: "gemini",
  LLM_MODEL: "some-flash-model",
  GEMINI_API_KEY: "gk",
  IP_HASH_SALT: "salt",
};

describe("parseServerEnv", () => {
  it("aplica los valores por defecto de la protección de cuota", () => {
    const env = parseServerEnv(base);
    expect(env.MAX_RUNS_PER_HOUR).toBe(5);
    expect(env.MAX_RUNS_PER_IP_PER_HOUR).toBe(3);
    expect(env.DEMO_ACCESS_CODE).toBeUndefined();
  });

  it("trata las variables vacías como no definidas", () => {
    const env = parseServerEnv({ ...base, DEMO_ACCESS_CODE: "", MAX_RUNS_PER_HOUR: "" });
    expect(env.DEMO_ACCESS_CODE).toBeUndefined();
    expect(env.MAX_RUNS_PER_HOUR).toBe(5);
  });

  it("exige LLM_MODEL y GEMINI_API_KEY solo con gemini", () => {
    expect(() => parseServerEnv({ ...base, LLM_MODEL: "" })).toThrow(/LLM_MODEL/);
    expect(() => parseServerEnv({ ...base, GEMINI_API_KEY: undefined })).toThrow(/GEMINI_API_KEY/);
    const mock = parseServerEnv({ ...base, LLM_PROVIDER: "mock", LLM_MODEL: "", GEMINI_API_KEY: "" });
    expect(mock.LLM_PROVIDER).toBe("mock");
  });

  it("rechaza proveedores desconocidos", () => {
    expect(() => parseServerEnv({ ...base, LLM_PROVIDER: "groq" })).toThrow(EnvError);
  });

  it("lista lo que falta sin incluir valores", () => {
    try {
      parseServerEnv({ ...base, SUPABASE_SECRET_KEY: "", IP_HASH_SALT: undefined });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(EnvError);
      const message = (e as EnvError).message;
      expect(message).toContain("SUPABASE_SECRET_KEY");
      expect(message).toContain("IP_HASH_SALT");
      expect(message).not.toContain("pk");
    }
  });
});
