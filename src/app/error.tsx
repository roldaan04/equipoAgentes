"use client"; // Los error boundaries son Client Components.
// Error inesperado al renderizar una página. En producción, Next no envía el mensaje
// de los errores de servidor al navegador: solo un identificador (digest) para los logs.
import Link from "next/link";
import { useEffect } from "react";
import { ErrorBanner } from "@/components/ErrorBanner";

export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const digest = error instanceof Error && "digest" in error && typeof error.digest === "string" ? error.digest : null;

  return (
    <div className="mx-auto max-w-xl py-16">
      <ErrorBanner
        title="Algo ha fallado al mostrar esta página"
        action={
          <button type="button" onClick={retry} className="rounded-lg bg-red-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-800">
            Reintentar
          </button>
        }
      >
        Puede ser un fallo puntual de conexión con el servidor o la base de datos. Prueba a reintentar o{" "}
        <Link href="/" className="font-medium underline">
          vuelve al inicio
        </Link>
        .{digest && <span className="mt-1 block font-mono text-[11px] opacity-70">Referencia: {digest}</span>}
      </ErrorBanner>
    </div>
  );
}
