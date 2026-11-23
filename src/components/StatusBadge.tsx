import { RUN_STATUS_META } from "@/lib/ui/meta";
import { cn } from "@/lib/ui/format";
import type { RunStatus } from "@/lib/supabase/types";

export function StatusBadge({ status, paused = false, className }: { status: RunStatus; paused?: boolean; className?: string }) {
  const meta = paused
    ? { label: "En pausa", className: "bg-yellow-100 text-yellow-900 ring-yellow-300" }
    : RUN_STATUS_META[status];
  const live = !paused && (status === "running" || status === "queued");
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset",
        meta.className,
        className,
      )}
    >
      {live && <span className="size-1.5 animate-working rounded-full bg-current" aria-hidden />}
      {meta.label}
    </span>
  );
}
