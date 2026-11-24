"use client";
// Driver de pasos: mientras el run no haya terminado, llama a
// POST /api/runs/[id]/step en bucle con 1 s entre pasos (cuota gratuita).
// 409 → reintenta a los 2 s. 429/5xx/red → backoff exponencial y aviso.
// LLM saturado (503) → espera 20 s con cuenta atrás y reanuda solo (máx. 3 veces seguidas).
// Cuota agotada (429) → se pausa y muestra el motivo. Botón Pausar/Reanudar.
import { useCallback, useEffect, useState } from "react";
import type { ApiError, StepResponse } from "@/lib/api-types";
import { decideAfterStep } from "@/lib/ui/driver-policy";

export type DriverMode = "running" | "paused" | "done";

export type DriverState = {
  mode: DriverMode;
  stepping: boolean;
  /** Aviso temporal (reintentos), cuenta atrás de reanudación automática («auto») o motivo de la pausa. */
  notice: { kind: "warning" | "quota" | "auto"; message: string } | null;
};

const STEP_GAP_MS = 1000;
const LOCKED_RETRY_MS = 2000;
const MAX_BACKOFF_MS = 30_000;
const MAX_CONSECUTIVE_ERRORS = 6;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function useRunDriver(
  runId: string,
  opts: { terminal: boolean; ready: boolean; startPaused: boolean; onStep?: (r: StepResponse) => void },
) {
  const { terminal, ready, startPaused, onStep } = opts;
  const [state, setState] = useState<DriverState>({ mode: "running", stepping: false, notice: null });
  const [initialized, setInitialized] = useState(false);

  // Al cargar: si el run se quedó en pausa por cuota, no se reanuda solo.
  if (ready && !initialized) {
    setInitialized(true);
    if (startPaused) {
      setState({
        mode: "paused",
        stepping: false,
        notice: { kind: "quota", message: "El run está en pausa porque el LLM no estaba disponible. Pulsa Reanudar para continuar." },
      });
    }
  }

  const effectiveMode: DriverMode = terminal ? "done" : state.mode;

  useEffect(() => {
    if (!ready || !initialized || effectiveMode !== "running") return;
    let cancelled = false;

    void (async () => {
      let backoff = 2000;
      let errors = 0;
      let autoResumes = 0; // reanudaciones automáticas seguidas por saturación del LLM
      const retryLater = async (message: string) => {
        errors++;
        if (errors >= MAX_CONSECUTIVE_ERRORS) {
          setState({ mode: "paused", stepping: false, notice: { kind: "warning", message: `${message} Se ha pausado tras varios intentos; pulsa Reanudar para volver a probar.` } });
          return false;
        }
        setState((s) => ({ ...s, stepping: false, notice: { kind: "warning", message: `${message} Reintentando en ${Math.round(backoff / 1000)} s…` } }));
        await sleep(backoff);
        backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
        return true;
      };

      while (!cancelled) {
        setState((s) => ({ ...s, stepping: true }));
        let res: Response;
        try {
          res = await fetch(`/api/runs/${runId}/step`, { method: "POST" });
        } catch {
          if (cancelled || !(await retryLater("Sin conexión con el servidor."))) return;
          continue;
        }
        if (cancelled) return;

        if (res.status === 409) {
          // Otro paso en curso (otra pestaña, o el anterior aún no ha soltado el lock).
          setState((s) => ({ ...s, stepping: false }));
          await sleep(LOCKED_RETRY_MS);
          continue;
        }
        if (res.status === 404) {
          setState({ mode: "done", stepping: false, notice: { kind: "warning", message: "Este run ya no existe." } });
          return;
        }
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as Partial<ApiError>;
          if (cancelled || !(await retryLater(`Error del servidor (${res.status}): ${body.error ?? "sin detalle"}.`))) return;
          continue;
        }

        const data = (await res.json()) as StepResponse;
        backoff = 2000;
        errors = 0;
        onStep?.(data);

        const decision = decideAfterStep(data, autoResumes);
        autoResumes = decision.autoResumes;
        const { next } = decision;

        if (next.action === "done") {
          setState({ mode: "done", stepping: false, notice: null });
          return;
        }
        if (next.action === "pause") {
          setState({ mode: "paused", stepping: false, notice: { kind: "quota", message: next.message } });
          return;
        }
        if (next.action === "auto-resume") {
          // Saturación temporal del LLM: se espera con cuenta atrás y se sigue solo.
          // Si el usuario pulsa Pausar, el efecto se limpia y `cancelled` corta la espera.
          for (let left = next.delaySeconds; left > 0; left--) {
            if (cancelled) return;
            setState((s) => ({
              ...s,
              stepping: false,
              notice: {
                kind: "auto",
                message: `Gemini no responde ahora mismo (saturación temporal). Reintento automático en ${left} s (intento ${next.attempt} de ${next.max}). Pulsa Pausar si prefieres detenerlo.`,
              },
            }));
            await sleep(1000);
          }
          continue;
        }
        setState((s) => ({ ...s, stepping: false, notice: null }));
        await sleep(STEP_GAP_MS);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [runId, ready, initialized, effectiveMode, onStep]);

  // El paso en curso (si lo hay) termina en el servidor; aquí solo se deja de pedir más.
  const pause = useCallback(() => setState({ mode: "paused", stepping: false, notice: null }), []);
  const resume = useCallback(() => setState({ mode: "running", stepping: false, notice: null }), []);

  return { ...state, mode: effectiveMode, pause, resume };
}
