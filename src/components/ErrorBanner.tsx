import type { ReactNode } from "react";
import { cn } from "@/lib/ui/format";
import { WarningIcon } from "./icons";

const STYLES = {
  error: "border-red-200 bg-red-50 text-red-900",
  warning: "border-yellow-300 bg-yellow-50 text-yellow-950",
  info: "border-sky-200 bg-sky-50 text-sky-950",
};

export function ErrorBanner({
  kind = "error",
  title,
  children,
  action,
}: {
  kind?: keyof typeof STYLES;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div role={kind === "info" ? "status" : "alert"} className={cn("flex animate-fade-in items-start gap-3 rounded-xl border px-4 py-3 text-sm", STYLES[kind])}>
      <WarningIcon className="mt-0.5 size-5 shrink-0 opacity-80" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{title}</p>
        {children && <div className="mt-0.5 opacity-90">{children}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
