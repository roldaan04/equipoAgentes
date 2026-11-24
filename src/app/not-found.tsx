import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Página no encontrada · Agent Team" };

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl py-16 text-center">
      <p className="font-mono text-sm font-semibold text-zinc-400">404</p>
      <h1 className="mt-2 text-2xl font-semibold text-zinc-900">Esta página no existe</h1>
      <p className="mt-2 text-sm text-zinc-600">Puede que el enlace esté mal copiado. Desde el inicio puedes lanzar un run nuevo o abrir uno reciente.</p>
      <Link href="/" className="mt-6 inline-flex rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-zinc-700">
        Volver al inicio
      </Link>
    </div>
  );
}
