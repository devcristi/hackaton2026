"use client";
import { useEffect, useMemo } from "react";
import { useTwinStream } from "../lib/sse";
import { useTwinStore } from "../store/twin-store";
import { SensorGrid } from "../components/sensors/SensorGrid";
import { LiveChart } from "../components/sensors/LiveChart";
import { BabyTwin3D } from "../components/twin3d/BabyTwin3D";
import { FsmStatusBar, deriveFsmState } from "../components/FsmStatusBar";
import { BackendStatus } from "../components/BackendStatus";
import { SEVERITY_COLORS } from "../lib/types";
import { fetchState } from "../lib/api";
import type { TwinState } from "../lib/types";

// ── Derive a 0–100 stress score from actual physiological & incubator data ──
const deriveStressScore = (s: TwinState): number => {
  const severityBase: Record<string, number> = {
    normal: 15,
    watch: 42,
    alert: 70,
    critical: 90,
  };
  let score = severityBase[s.severity] ?? 15;

  // Heart rate deviation (Normal: 120-140)
  const bpm = s.reading.bpm ?? 130;
  if (bpm > 160) score += (bpm - 160) * 0.5;
  if (bpm < 100) score += (100 - bpm) * 1.0;

  // SpO2 penalty
  const spo2 = s.reading.spO2 ?? 98;
  if (spo2 < 95) score += (95 - spo2) * 4;

  // Lid-open penalty (cold draft / noise stress)
  if (s.reading.lidOpen) score += 10;

  // Movement jerk (MPU6050) — high accel variance → restlessness
  const ax = s.reading.accelX ?? 0;
  const ay = s.reading.accelY ?? 0;
  const az = s.reading.accelZ ?? 0;
  const jerk = Math.sqrt(ax * ax + ay * ay + az * az);
  if (jerk > 1.5) score += Math.min(12, (jerk - 1.5) * 6);

  return Math.min(100, Math.max(0, Math.round(score)));
};

export default function DashboardPage() {
  useTwinStream();

  const state              = useTwinStore((s) => s.state);
  const history            = useTwinStore((s) => s.history);
  const setState           = useTwinStore((s) => s.setState);
  const addHistory         = useTwinStore((s) => s.addHistory);
  const fsmStateOverride   = useTwinStore((s) => s.fsmStateOverride);
  const setFsmStateOverride = useTwinStore((s) => s.setFsmStateOverride);

  useEffect(() => {
    fetchState()
      .then((s) => { setState(s); addHistory(s.reading); })
      .catch(() => {/* server may not be up yet – SSE will fill in */});
  }, [setState, addHistory]);

  const stressScore = useMemo(
    () => (state ? deriveStressScore(state) : 15),
    [state]
  );
  
  const heartRate = state?.reading.bpm ?? 130;
  const spO2      = state?.reading.spO2 ?? 98;
  const tempC     = state?.reading.airTempC ?? state?.reading.mpuTempC ?? 37.0;

  const derivedFsmState = useMemo(() => {
    const result = state ? deriveFsmState(state) : "ok";
    return result;
  }, [state]);

  const fsmState = fsmStateOverride ?? derivedFsmState;

  if (!state) {
    return (
      <main className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4 animate-spin">⚙️</div>
          <p className="text-slate-400 text-sm">Waiting for NeoTwin data…</p>
          <p className="text-slate-600 text-xs mt-1">
            Start the mock: <code className="bg-slate-800 px-1 rounded">make mock</code>
          </p>
        </div>
      </main>
    );
  }

  const sevColor = SEVERITY_COLORS[state.severity];
  const sevLabel = state.severity.toUpperCase();

  return (
    <main className="h-screen flex flex-col overflow-hidden bg-slate-950 text-white">
      {/* ── TOP HEADER ─────────────────────────────────────────────────────── */}
      <header className="flex-shrink-0 flex items-center justify-between px-4 md:px-6 py-3 border-b border-slate-800/60 bg-slate-950/80 backdrop-blur z-20">
        <div>
          <h1 className="text-xl font-bold tracking-tight">🩺 MediTwin</h1>
          <p className="text-slate-500 text-xs">Neonatal Bio-Twin · Digital Incubator</p>
        </div>
        <div className="flex items-center gap-3">
          <BackendStatus />
          <span className={`text-sm font-bold px-3 py-1 rounded-full border ${sevColor} border-current/20`}>
            {sevLabel}
          </span>
          <span className="text-xs text-slate-500 font-mono">
            {new Date(state.reading.ts * 1000).toLocaleTimeString()}
          </span>
        </div>
      </header>

      {/* ── FSM STATUS BAR ─────────────────────────────────────────────────── */}
      <div className="flex-shrink-0">
        <FsmStatusBar
          current={fsmState}
          isOverride={fsmStateOverride !== null}
          onStateChange={setFsmStateOverride}
        />
      </div>

      {/* ── TWO-COLUMN LAYOUT ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 flex-1 min-h-0">

        {/* ── LEFT COLUMN: sensor data ──────────────────────────────────── */}
        <div className="flex flex-col gap-5 p-4 md:p-5 border-r border-slate-800/40 overflow-y-auto h-full">

          {/* Active rules banner */}
          {state.activeRules.length > 0 && (
            <div className={`rounded-xl border p-3 text-sm ${sevColor} bg-slate-900/60`}>
              <span className="font-semibold">⚠️ Active rules: </span>
              {state.activeRules.join(" · ")}
            </div>
          )}

          {/* Sensor Details (Unified Grid) */}
          <div className="flex flex-col gap-3">
            <p className="text-[10px] text-slate-500 font-mono uppercase tracking-widest">Sensor Details</p>
            <SensorGrid state={state} />
          </div>

          {/* Live chart */}
          {history.length > 1 && <LiveChart history={history} />}

          {/* Footer */}
          <footer className="text-center text-xs text-slate-700 pb-2 mt-auto">
            MediTwin by Hippomed · IESC Students @ Code the Future Hackathon 2026
          </footer>
        </div>

        {/* ── RIGHT COLUMN: 3D Bio-Twin viewer ──────────────────────────── */}
        <div className="flex flex-col h-full p-4 md:p-5 gap-3 bg-slate-950 min-h-0">
          <div className="flex-1 min-h-0">
            <BabyTwin3D
              stressScore={stressScore}
              heartRate={heartRate}
              temperature={tempC}
              spO2={spO2}
            />
          </div>
        </div>

      </div>
    </main>
  );
}
