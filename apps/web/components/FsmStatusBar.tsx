"use client";

import type { Severity, TwinState } from "../lib/types";
import {
  airQualitySeverity,
  airTempSeverity,
  bpmSeverity,
  diaSeverity,
  heaterSeverity,
  humiditySeverity,
  lidSeverity,
  riskSeverity,
  spO2Severity,
  sysSeverity,
} from "../lib/sensorSeverity";

// ── FSM State type ────────────────────────────────────────────────────────────
export type FsmState = "ok" | "warning" | "critical" | "motion";

// ── Severity rank (higher = worse) ───────────────────────────────────────────
const SEVERITY_RANK: Record<Severity, number> = {
  normal:   0,
  watch:    1,
  alert:    2,
  critical: 3,
};

const worstSeverity = (...severities: Severity[]): Severity =>
  severities.reduce<Severity>(
    (worst, s) => (SEVERITY_RANK[s] > SEVERITY_RANK[worst] ? s : worst),
    "normal"
  );

// ── Derive FSM state from live sensor readings ────────────────────────────────
export const deriveFsmState = (s: TwinState): FsmState => {
  const r = s.reading;

  // Motion check — accelerometer jerk overrides severity
  const ax = r.accelX ?? 0;
  const ay = r.accelY ?? 0;
  const az = r.accelZ ?? 0;
  const jerk = Math.sqrt(ax * ax + ay * ay + az * az);
  if (jerk > 1.2) return "motion";

  // Compute worst severity across every monitored sensor
  const worst = worstSeverity(
    bpmSeverity(r.bpm),
    spO2Severity(r.spO2),
    sysSeverity(r.bloodPressureSystolic),
    diaSeverity(r.bloodPressureDiastolic),
    airTempSeverity(r.airTempC),
    humiditySeverity(r.humidityPct),
    airQualitySeverity(r.airQualityRaw),
    lidSeverity(r.lidDistanceCm),
    heaterSeverity(r.heaterCurrentA),
    riskSeverity(r.riskScore),
    // Also honour backend severity as a floor
    s.severity,
  );

  if (worst === "critical") return "critical";
  if (worst === "alert" || worst === "watch") return "warning";
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
