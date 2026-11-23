import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Agent Team · Speed Paradigm",
  description:
    "Tres agentes de IA (Orquestador, Develop y Testing) que colaboran para modificar una web, en directo.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <header className="border-b border-zinc-200 bg-white/80 backdrop-blur">
          <div className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between px-4 sm:px-6">
            <Link href="/" className="flex items-center gap-2 font-semibold text-zinc-900">
              <span className="flex gap-0.5" aria-hidden>
                <span className="size-2.5 rounded-full bg-violet-500" />
                <span className="size-2.5 rounded-full bg-blue-500" />
                <span className="size-2.5 rounded-full bg-amber-500" />
              </span>
              Agent Team
            </Link>
            <span className="text-xs text-zinc-500">Prueba técnica · Speed Paradigm</span>
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">{children}</main>
        <footer className="border-t border-zinc-200 py-4 text-center text-xs text-zinc-500">
          Next.js · Supabase · Gemini (plan gratuito) · Hecho con Claude Code
        </footer>
      </body>
    </html>
  );
}
