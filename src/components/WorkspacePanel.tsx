"use client";
// Pestañas Vista previa / Archivos. La vista previa se recarga cuando una tarea
// pasa a «Completada»; los archivos tocados por Develop van marcados.
import { useEffect, useMemo, useState } from "react";
import type { FileMeta, FilesResponse } from "@/lib/api-types";
import type { WorkspaceFile } from "@/lib/supabase/types";
import { cn, formatBytes } from "@/lib/ui/format";
import { ExternalIcon, FileIcon, RefreshIcon } from "./icons";

type Tab = "preview" | "files";

function PreviewFrame({ runId, reloadKey }: { runId: string; reloadKey: number }) {
  const [manual, setManual] = useState(0);
  const src = `/preview/${runId}/index.html`;
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-zinc-100 bg-zinc-50 px-3 py-2">
        <div className="flex gap-1" aria-hidden>
          <span className="size-2.5 rounded-full bg-red-300" />
          <span className="size-2.5 rounded-full bg-amber-300" />
          <span className="size-2.5 rounded-full bg-emerald-300" />
        </div>
        <span className="min-w-0 flex-1 truncate rounded-md bg-white px-2 py-0.5 font-mono text-[11px] text-zinc-500 ring-1 ring-zinc-200">{src}</span>
        <button type="button" onClick={() => setManual((n) => n + 1)} className="rounded-md p-1 text-zinc-500 hover:bg-white hover:text-zinc-800" title="Recargar" aria-label="Recargar vista previa">
          <RefreshIcon />
        </button>
        <a href={src} target="_blank" rel="noopener noreferrer" className="rounded-md p-1 text-zinc-500 hover:bg-white hover:text-zinc-800" title="Abrir en una pestaña nueva" aria-label="Abrir vista previa en una pestaña nueva">
          <ExternalIcon />
        </a>
      </div>
      <iframe
        key={`${reloadKey}:${manual}`}
        src={src}
        title="Vista previa de la web generada"
        sandbox="allow-scripts allow-forms"
        className="w-full flex-1 bg-white"
      />
    </div>
  );
}

function CodeViewer({ file }: { file: WorkspaceFile | undefined }) {
  if (!file) return <p className="p-4 text-sm text-zinc-500">Selecciona un archivo.</p>;
  const lines = file.content.split("\n");
  return (
    <pre className="h-full overflow-auto bg-zinc-950 py-3 text-[12px] leading-5 text-zinc-100">
      <code>
        {lines.map((line, i) => (
          <div key={i} className="flex">
            <span className="w-10 shrink-0 select-none pr-3 text-right text-zinc-600">{i + 1}</span>
            <span className="whitespace-pre pr-4">{line || " "}</span>
          </div>
        ))}
      </code>
    </pre>
  );
}

function FilesTab({ runId, files }: { runId: string; files: FileMeta[] }) {
  const [contents, setContents] = useState<WorkspaceFile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  // Se vuelve a pedir el contenido cuando cambia algún archivo.
  const signature = files.map((f) => `${f.path}@${f.updated_at}`).join("|");

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/runs/${runId}/files`, { cache: "no-store" })
      .then(async (res) => {
        const body = (await res.json()) as FilesResponse & { error?: string };
        if (!res.ok) throw new Error(body.error ?? `Error ${res.status}`);
        if (!cancelled) {
          setContents(body.files);
          setError(null);
        }
      })
      .catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : "No se pudieron cargar los archivos."));
    return () => {
      cancelled = true;
    };
  }, [runId, signature]);

  const groups = useMemo(() => {
    const map = new Map<string, FileMeta[]>();
    for (const f of files) {
      const dir = f.path.includes("/") ? f.path.slice(0, f.path.lastIndexOf("/")) : "";
      map.set(dir, [...(map.get(dir) ?? []), f]);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [files]);

  const current = selected ?? files.find((f) => f.updated_by === "develop")?.path ?? files[0]?.path ?? null;
  const touched = files.filter((f) => f.updated_by === "develop").length;

  return (
    <div className="flex h-full flex-col sm:flex-row">
      <nav className="max-h-44 shrink-0 overflow-y-auto border-b border-zinc-100 p-2 sm:max-h-none sm:w-56 sm:border-b-0 sm:border-r" aria-label="Archivos">
        <p className="px-2 pb-2 text-[11px] text-zinc-500">
          {files.length} archivos · <span className="font-semibold text-blue-700">{touched} tocados por Develop</span>
        </p>
        {groups.map(([dir, list]) => (
          <div key={dir || "/"} className="mb-1">
            {dir && <p className="px-2 pt-1 font-mono text-[11px] text-zinc-400">{dir}/</p>}
            {list.map((f) => (
              <button
                key={f.path}
                type="button"
                onClick={() => setSelected(f.path)}
                className={cn(
                  "flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-xs",
                  dir && "pl-4",
                  current === f.path ? "bg-sky-100 text-sky-900" : "text-zinc-700 hover:bg-zinc-100",
                )}
              >
                <FileIcon className="size-3.5 shrink-0 text-zinc-400" />
                <span className="min-w-0 flex-1 truncate font-mono">{f.path.slice(f.path.lastIndexOf("/") + 1)}</span>
                {f.updated_by === "develop" && <span className="size-1.5 shrink-0 rounded-full bg-blue-500" title="Modificado por Develop" />}
                <span className="shrink-0 text-[10px] text-zinc-400">{formatBytes(f.bytes)}</span>
              </button>
            ))}
          </div>
        ))}
      </nav>
      <div className="min-h-0 min-w-0 flex-1">
        {error ? <p className="p-4 text-sm text-red-700">{error}</p> : contents ? <CodeViewer file={contents.find((f) => f.path === current)} /> : <p className="p-4 text-sm text-zinc-500">Cargando archivos…</p>}
      </div>
    </div>
  );
}

export function WorkspacePanel({ runId, files, doneCount, terminal }: { runId: string; files: FileMeta[]; doneCount: number; terminal: boolean }) {
  const [tab, setTab] = useState<Tab>("preview");
  // Recarga la vista previa cuando se completa una tarea o termina el run.
  const reloadKey = doneCount * 2 + (terminal ? 1 : 0);

  return (
    <section aria-label="Archivos y vista previa" className="flex h-[560px] flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
      <div className="flex items-center gap-1 border-b border-zinc-100 px-2 pt-2" role="tablist">
        {(
          [
            ["preview", "Vista previa"],
            ["files", "Archivos"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={cn(
              "rounded-t-lg px-3 py-2 text-sm font-medium transition",
              tab === id ? "bg-white text-zinc-900 shadow-[inset_0_-2px_0] shadow-sky-500" : "text-zinc-500 hover:text-zinc-800",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1">{tab === "preview" ? <PreviewFrame runId={runId} reloadKey={reloadKey} /> : <FilesTab runId={runId} files={files} />}</div>
    </section>
  );
}
