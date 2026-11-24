"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { REQUEST_MAX, REQUEST_MIN, type ApiError, type ConfigResponse, type CreateRunResponse } from "@/lib/api-types";
import { cn } from "@/lib/ui/format";
import { ErrorBanner } from "./ErrorBanner";

const EXAMPLES = [
  "Añade una página de contacto con formulario",
  "Añade una sección de testimonios",
  "Haz el menú responsive con botón hamburguesa",
];

const NAVIGATION_FALLBACK_MS = 5000;

export function LaunchForm() {
  const router = useRouter();
  const [request, setRequest] = useState("");
  const [accessCode, setAccessCode] = useState("");
  const [config, setConfig] = useState<ConfigResponse | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/config", { cache: "no-store" })
      .then(async (r) => (r.ok ? setConfig((await r.json()) as ConfigResponse) : null))
      .catch(() => null);
  }, []);

  const length = request.trim().length;
  const valid = length >= REQUEST_MIN && length <= REQUEST_MAX;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!valid || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request: request.trim(), accessCode: accessCode || undefined }),
      });
      const body = (await res.json().catch(() => ({}))) as Partial<CreateRunResponse & ApiError>;
      if (!res.ok || !body.id) throw new Error(body.error ?? `Error ${res.status} al crear el run.`);
      const url = `/runs/${body.id}`;
      router.push(url);
      // Red de seguridad: en una prueba la navegación en el cliente no terminó nunca (el servidor
      // había respondido bien) y el botón se quedó en «Lanzando…». Si en unos segundos seguimos
      // aquí, se hace una navegación completa. Si el push funciona, este componente se desmonta
      // con la página y el temporizador no llega a hacer nada visible.
      setTimeout(() => {
        if (window.location.pathname !== url) window.location.assign(new URL(url, window.location.origin));
      }, NAVIGATION_FALLBACK_MS);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear el run. Comprueba tu conexión.");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <label htmlFor="request" className="text-sm font-semibold text-zinc-900">
        ¿Qué quieres cambiar en la web?
      </label>
      <p className="mt-0.5 text-xs text-zinc-500">
        El equipo trabaja sobre «Horno Alba», una web de ejemplo de una panadería (tres páginas en HTML, CSS y JS).
      </p>
      <textarea
        id="request"
        value={request}
        onChange={(e) => setRequest(e.target.value)}
        rows={3}
        maxLength={REQUEST_MAX}
        placeholder="Ej.: Añade una página de contacto con formulario"
        className="mt-3 w-full resize-y rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 shadow-inner outline-none placeholder:text-zinc-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void onSubmit(e);
        }}
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="text-xs text-zinc-500">Ejemplos:</span>
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            type="button"
            onClick={() => setRequest(ex)}
            className={cn(
              "rounded-full border px-2.5 py-1 text-xs transition",
              request === ex ? "border-sky-400 bg-sky-50 text-sky-900" : "border-zinc-200 bg-zinc-50 text-zinc-700 hover:border-zinc-300 hover:bg-white",
            )}
          >
            {ex}
          </button>
        ))}
      </div>

      {config?.accessCodeRequired && (
        <div className="mt-4">
          <label htmlFor="access-code" className="text-xs font-semibold text-zinc-700">
            Código de acceso
          </label>
          <input
            id="access-code"
            type="password"
            value={accessCode}
            onChange={(e) => setAccessCode(e.target.value)}
            autoComplete="off"
            className="mt-1 block w-full max-w-xs rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
          />
          <p className="mt-1 text-xs text-zinc-500">La demo está protegida para no agotar la cuota gratuita del LLM.</p>
        </div>
      )}

      {error && (
        <div className="mt-4">
          <ErrorBanner title="No se pudo lanzar el equipo">{error}</ErrorBanner>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-zinc-500">
          {config ? (
            config.provider === "mock" ? (
              <span className="rounded bg-yellow-100 px-1.5 py-0.5 font-medium text-yellow-900">Modo demo: LLM simulado (sin cuota)</span>
            ) : (
              <>
                LLM: <span className="font-mono">{config.model}</span> (plan gratuito)
              </>
            )
          ) : (
            " "
          )}
          <span className={cn("ml-2", length > REQUEST_MAX - 50 && "text-orange-700")}>
            {length}/{REQUEST_MAX}
          </span>
        </p>
        <button
          type="submit"
          disabled={!valid || submitting}
          className="inline-flex items-center gap-2 rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:bg-zinc-300"
        >
          {submitting && <span className="size-3 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden />}
          {submitting ? "Lanzando…" : "Lanzar equipo"}
        </button>
      </div>
    </form>
  );
}
