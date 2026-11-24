"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { RunListItem } from "@/lib/api-types";
import { relativeTime } from "@/lib/ui/format";
import { StatusBadge } from "./StatusBadge";

export function RecentRuns() {
  const [runs, setRuns] = useState<RunListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/runs", { cache: "no-store" })
      .then(async (r) => {
        const body = (await r.json().catch(() => ({}))) as { runs?: RunListItem[]; error?: string };
        if (!r.ok) throw new Error(body.error ?? `Error ${r.status} al cargar los runs.`);
        if (!cancelled) setRuns(body.runs ?? []);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error && e.message !== "Failed to fetch" ? e.message : "No se puede conectar con el servidor.");
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const retry = () => {
    setError(null);
    setRuns(null);
    setAttempt((n) => n + 1);
  };

  return (
    <section aria-label="Runs recientes" className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
      <h2 className="border-b border-zinc-100 px-5 py-3 text-sm font-semibold text-zinc-900">Runs recientes</h2>
      {error && (
        <div className="px-5 py-4 text-sm">
          <p className="text-red-700">{error}</p>
          <button type="button" onClick={retry} className="mt-2 rounded-lg border border-zinc-300 px-3 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50">
            Reintentar
          </button>
        </div>
      )}
      {!error && runs === null && (
        <ul className="space-y-2 p-5" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <li key={i} className="h-10 animate-pulse rounded-lg bg-zinc-100" />
          ))}
        </ul>
      )}
      {runs?.length === 0 && <p className="px-5 py-6 text-sm text-zinc-500">Todavía no hay runs. ¡Lanza el primero!</p>}
      {runs && runs.length > 0 && (
        <ul className="divide-y divide-zinc-100">
          {runs.map((r) => (
            <li key={r.id}>
              <Link href={`/runs/${r.id}`} className="flex items-center gap-3 px-5 py-3 transition hover:bg-zinc-50">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-zinc-900">{r.request}</p>
                  <p className="text-xs text-zinc-500">
                    {relativeTime(r.created_at)}
                    {r.tasks_total > 0 && ` · ${r.tasks_done}/${r.tasks_total} tareas`}
                  </p>
                </div>
                <StatusBadge status={r.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
