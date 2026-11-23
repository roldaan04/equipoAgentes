import { AgentIcon } from "@/components/icons";
import { LaunchForm } from "@/components/LaunchForm";
import { RecentRuns } from "@/components/RecentRuns";
import { AGENT_META, AGENT_ORDER } from "@/lib/ui/meta";
import { cn } from "@/lib/ui/format";

export default function Home() {
  return (
    <div className="space-y-8">
      <section className="pt-4">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 sm:text-4xl">Un equipo de 3 agentes de IA, trabajando a la vista</h1>
        <p className="mt-3 max-w-2xl text-zinc-600">
          Pide un cambio en una web y mira cómo el Orquestador lo divide en tareas, Develop las programa y Testing las revisa hasta que todo pasa (máximo 3
          intentos por tarea).
        </p>
      </section>

      <ol className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {AGENT_ORDER.map((agent, i) => {
          const meta = AGENT_META[agent];
          return (
            <li key={agent} className="flex gap-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
              <div className={cn("grid size-10 shrink-0 place-items-center rounded-xl", meta.soft, meta.text)}>
                <AgentIcon agent={agent} />
              </div>
              <div>
                <p className="font-semibold text-zinc-900">
                  <span className="mr-1 font-mono text-xs text-zinc-400">{i + 1}.</span>
                  {meta.label}
                </p>
                <p className="text-sm text-zinc-600">{meta.role}</p>
              </div>
            </li>
          );
        })}
      </ol>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="min-w-0 lg:col-span-3">
          <LaunchForm />
        </div>
        <div className="min-w-0 lg:col-span-2">
          <RecentRuns />
        </div>
      </div>
    </div>
  );
}
