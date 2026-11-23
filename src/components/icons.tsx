// Iconos SVG en línea (sin librerías). Heredan el color con currentColor.
import type { EventAgent, EventType } from "@/lib/supabase/types";

type IconProps = { className?: string };

const base = (className?: string) => ({
  className: className ?? "size-5",
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
});

export function OrchestratorIcon({ className }: IconProps) {
  // Nodos conectados: reparte el trabajo
  return (
    <svg {...base(className)}>
      <circle cx="12" cy="5" r="2.5" />
      <circle cx="5" cy="19" r="2.5" />
      <circle cx="19" cy="19" r="2.5" />
      <path d="M12 7.5v4M12 11.5l-5.5 5M12 11.5l5.5 5" />
    </svg>
  );
}

export function DevelopIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="m8 8-4 4 4 4M16 8l4 4-4 4M13.5 5l-3 14" />
    </svg>
  );
}

export function TestingIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M12 3 4.5 6v5.5c0 4.5 3.2 8.3 7.5 9.5 4.3-1.2 7.5-5 7.5-9.5V6L12 3Z" />
      <path d="m8.8 12.2 2.2 2.2 4.4-4.6" />
    </svg>
  );
}

export function SystemIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4l2.5 2.5" />
    </svg>
  );
}

export function AgentIcon({ agent, className }: { agent: EventAgent } & IconProps) {
  switch (agent) {
    case "orchestrator":
      return <OrchestratorIcon className={className} />;
    case "develop":
      return <DevelopIcon className={className} />;
    case "testing":
      return <TestingIcon className={className} />;
    default:
      return <SystemIcon className={className} />;
  }
}

export function CheckIcon({ className }: IconProps) {
  return (
    <svg {...base(className ?? "size-4")}>
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </svg>
  );
}

export function CrossIcon({ className }: IconProps) {
  return (
    <svg {...base(className ?? "size-4")}>
      <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />
    </svg>
  );
}

export function DotIcon({ className }: IconProps) {
  return (
    <svg {...base(className ?? "size-4")}>
      <circle cx="12" cy="12" r="3" fill="currentColor" />
    </svg>
  );
}

export function EventTypeIcon({ type, className }: { type: EventType } & IconProps) {
  const cls = className ?? "size-3.5";
  switch (type) {
    case "result":
      return <CheckIcon className={cls} />;
    case "error":
      return <CrossIcon className={cls} />;
    case "action":
      return (
        <svg {...base(cls)}>
          <path d="M5 12h12M13 7l5 5-5 5" />
        </svg>
      );
    case "thinking":
      return (
        <svg {...base(cls)}>
          <circle cx="6" cy="12" r="1" fill="currentColor" />
          <circle cx="12" cy="12" r="1" fill="currentColor" />
          <circle cx="18" cy="12" r="1" fill="currentColor" />
        </svg>
      );
    default:
      return (
        <svg {...base(cls)}>
          <path d="m9 6 6 6-6 6" />
        </svg>
      );
  }
}

export function PauseIcon({ className }: IconProps) {
  return (
    <svg {...base(className ?? "size-4")}>
      <path d="M9 6v12M15 6v12" />
    </svg>
  );
}

export function PlayIcon({ className }: IconProps) {
  return (
    <svg {...base(className ?? "size-4")}>
      <path d="M8 5.5v13l10-6.5-10-6.5Z" />
    </svg>
  );
}

export function ExternalIcon({ className }: IconProps) {
  return (
    <svg {...base(className ?? "size-4")}>
      <path d="M14 5h5v5M19 5l-8 8M18 14v4a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h4" />
    </svg>
  );
}

export function RefreshIcon({ className }: IconProps) {
  return (
    <svg {...base(className ?? "size-4")}>
      <path d="M19 12a7 7 0 1 1-2.05-4.95M19 5v4h-4" />
    </svg>
  );
}

export function FileIcon({ className }: IconProps) {
  return (
    <svg {...base(className ?? "size-4")}>
      <path d="M14 3H7a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V7l-4-4Z" />
      <path d="M14 3v4h4" />
    </svg>
  );
}

export function WarningIcon({ className }: IconProps) {
  return (
    <svg {...base(className ?? "size-5")}>
      <path d="M12 4 2.5 20h19L12 4Z" />
      <path d="M12 10v4.5M12 17.5v.01" />
    </svg>
  );
}
