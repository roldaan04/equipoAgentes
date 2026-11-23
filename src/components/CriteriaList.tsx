import type { AcceptanceCriterion, CriterionCheck, CriterionResult } from "@/lib/supabase/types";
import { cn } from "@/lib/ui/format";
import { CheckIcon, CrossIcon, DotIcon } from "./icons";

export function describeCheck(check: CriterionCheck): string {
  switch (check.type) {
    case "file_exists":
      return `existe ${check.path}`;
    case "selector_exists":
      return `${check.path} contiene «${check.selector}»`;
    case "text_contains":
      return `${check.path} incluye «${check.text}»`;
    case "link_exists":
      return `${check.from} enlaza a ${check.href}`;
  }
}

export function CriterionMark({ passed }: { passed: boolean | undefined }) {
  if (passed === undefined) return <DotIcon className="size-4 shrink-0 text-zinc-300" />;
  return passed ? (
    <CheckIcon className="size-4 shrink-0 text-emerald-600" />
  ) : (
    <CrossIcon className="size-4 shrink-0 text-red-600" />
  );
}

export function CriteriaList({
  criteria,
  results,
  compact = false,
  showReasons = false,
}: {
  criteria: AcceptanceCriterion[];
  results?: CriterionResult[];
  compact?: boolean;
  showReasons?: boolean;
}) {
  const byId = new Map((results ?? []).map((r) => [r.criterion_id, r]));
  return (
    <ul className={cn("space-y-1", compact ? "text-xs" : "text-sm")}>
      {criteria.map((c) => {
        const r = byId.get(c.id);
        return (
          <li key={c.id} className="flex gap-1.5">
            <span className="mt-0.5">
              <CriterionMark passed={r?.passed} />
            </span>
            <span className="min-w-0">
              <span className={cn(compact && "line-clamp-2", r && !r.passed ? "text-red-800" : "text-zinc-700")}>{c.description}</span>
              {!compact && c.check && (
                <span className="ml-1.5 inline-block rounded bg-zinc-100 px-1.5 py-px font-mono text-[11px] text-zinc-500">
                  check: {describeCheck(c.check)}
                </span>
              )}
              {showReasons && r?.reason && <span className="block text-xs text-zinc-500">{r.reason}</span>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
