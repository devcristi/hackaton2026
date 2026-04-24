"use client";

import type { TwinState } from "../lib/types";

// ── FSM State type ────────────────────────────────────────────────────────────
export type FsmState = "ok" | "warning" | "critical" | "motion";

// ── Derive FSM state from backend TwinState ───────────────────────────────────
export const deriveFsmState = (s: TwinState): FsmState => {
  const ax = s.reading.accelX ?? 0;
  const ay = s.reading.accelY ?? 0;
  const az = s.reading.accelZ ?? 0;
  const jerk = Math.sqrt(ax * ax + ay * ay + az * az);

  console.log(`[deriveFsmState] jerk=${jerk.toFixed(2)}, severity=${s.severity}`);

  // Motion check first — even if severity is OK the incubator might be moved
  if (jerk > 1.2) return "motion";

  if (s.severity === "critical") return "critical";
  if (s.severity === "alert" || s.severity === "watch") return "warning";
  return "ok";
};

// ── Per-state visual config ───────────────────────────────────────────────────
const FSM_CONFIG: Record<
  FsmState,
  {
    label: string;
    icon: string;
    dotColor: string;       // Tailwind bg of the live dot
    activeBg: string;       // pill background when active
    activeBorder: string;   // pill border when active
    activeText: string;     // label colour when active
    iconClass: string;      // animation applied to icon span
  }
> = {
  ok: {
    label: "STABLE",
    icon: "✔",
    dotColor: "bg-emerald-400",
    activeBg: "bg-emerald-950/70",
    activeBorder: "border-emerald-500",
    activeText: "text-emerald-300",
    iconClass: "",
  },
  warning: {
    label: "WARNING",
    icon: "⚠",
    dotColor: "bg-yellow-400",
    activeBg: "bg-yellow-950/70",
    activeBorder: "border-yellow-400",
    activeText: "text-yellow-300",
    iconClass: "animate-pulse",
  },
  critical: {
    label: "CRITICAL",
    icon: "🚨",
    dotColor: "bg-red-500",
    activeBg: "bg-red-950/70",
    activeBorder: "border-red-500",
    activeText: "text-red-300",
    iconClass: "animate-alarm",
  },
  motion: {
    label: "MOTION",
    icon: "📳",
    dotColor: "bg-amber-400",
    activeBg: "bg-amber-950/70",
    activeBorder: "border-amber-400",
    activeText: "text-amber-300",
    iconClass: "animate-shake",
  },
};

const ORDER: FsmState[] = ["ok", "warning", "critical", "motion"];

// ── Component ─────────────────────────────────────────────────────────────────
interface FsmStatusBarProps {
  current: FsmState;
  /** When provided the pills become clickable; clicking the active pill clears the override */
  onStateChange?: (s: FsmState | null) => void;
  /** When true the current state is a manual override, not derived */
  isOverride?: boolean;
}

export const FsmStatusBar = ({ current, onStateChange, isOverride = false }: FsmStatusBarProps) => {
  console.log(`[FsmStatusBar] current=${current} override=${isOverride}`);
  const cfg = FSM_CONFIG[current];

  return (
    <div className="flex items-center gap-2 px-4 md:px-6 py-2 bg-slate-900/50 border-b border-slate-800/60 backdrop-blur sticky top-[52px] z-10 overflow-x-auto">
      {/* Live indicator dot */}
      <span
        className={`shrink-0 w-2 h-2 rounded-full ${cfg.dotColor} animate-pulse`}
      />

      {/* State pills */}
      <div className="flex items-center gap-2 flex-1 min-w-0">
        {ORDER.map((state) => {
          const c = FSM_CONFIG[state];
          const isActive = state === current;
          return (
            <button
              key={state}
              type="button"
              onClick={() => {
                if (!onStateChange) return;
                // clicking the already-active overridden pill → clear override
                onStateChange(isActive && isOverride ? null : state);
              }}
              title={onStateChange ? (isActive && isOverride ? "Clear override" : `Force ${state.toUpperCase()}`) : undefined}
              className={[
                "flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-bold tracking-wider transition-all duration-300 select-none shrink-0",
                onStateChange ? "cursor-pointer hover:opacity-80 active:scale-95" : "cursor-default",
                isActive
                  ? `${c.activeBg} ${c.activeBorder} ${c.activeText}`
                  : "bg-slate-900/30 border-slate-700/40 text-slate-600",
              ].join(" ")}
            >
              <span className={isActive ? c.iconClass : ""}>{c.icon}</span>
              {state.toUpperCase()}
              {isActive && (
                <span
                  className={`w-1.5 h-1.5 rounded-full ${c.dotColor} animate-pulse ml-0.5`}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Active state label + override badge */}
      <div className="flex items-center gap-1.5 shrink-0 hidden sm:flex">
        {isOverride && (
          <span className="text-xs font-mono text-amber-400 border border-amber-600/50 rounded px-1 py-0.5 bg-amber-950/40">
            MANUAL
          </span>
        )}
        <span className={`text-xs font-mono ${cfg.activeText} opacity-70`}>
          FSM_{current.toUpperCase()}
        </span>
      </div>
    </div>
  );
};
