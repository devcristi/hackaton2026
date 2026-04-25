"use client";
import { useTwinStore } from "../store/twin-store";

export const SimulationControls = () => {
  const state = useTwinStore((s) => s.state);
  const forceUpdateState = useTwinStore((s) => s.forceUpdateState);

  if (!state) return null;

  const r = state.reading;

  const handleChange = (partial: any) => {
    forceUpdateState(partial);
  };

  return (
    <div className="bg-slate-900/40 border border-slate-800/60 rounded-xl p-4 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-300">Physiological Controls</h3>
        <span className="text-[10px] bg-indigo-500/20 text-indigo-400 px-2 py-0.5 rounded uppercase tracking-wider">Manual Override</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Heart Rate Slider */}
        <div className="flex flex-col gap-2">
          <div className="flex justify-between text-xs">
            <label className="text-slate-400">Heart Rate (BPM)</label>
            <span className="text-indigo-400 font-mono">{Math.round(r.bpm ?? 140)}</span>
          </div>
          <input
            type="range"
            min="80"
            max="220"
            step="1"
            value={r.bpm ?? 140}
            onChange={(e) => handleChange({ bpm: parseFloat(e.target.value) })}
            className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
          />
        </div>

        {/* SpO2 Slider */}
        <div className="flex flex-col gap-2">
          <div className="flex justify-between text-xs">
            <label className="text-slate-400">Oxygen (SpO₂ %)</label>
            <span className="text-emerald-400 font-mono">{Math.round(r.spO2 ?? 92)}%</span>
          </div>
          <input
            type="range"
            min="70"
            max="100"
            step="0.5"
            value={r.spO2 ?? 92}
            onChange={(e) => handleChange({ spO2: parseFloat(e.target.value) })}
            className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
          />
        </div>

        {/* Systolic BP Slider */}
        <div className="flex flex-col gap-2">
          <div className="flex justify-between text-xs">
            <label className="text-slate-400">Systolic BP (mmHg)</label>
            <span className="text-rose-400 font-mono">{Math.round(r.bloodPressureSystolic ?? 55)}</span>
          </div>
          <input
            type="range"
            min="30"
            max="100"
            step="1"
            value={r.bloodPressureSystolic ?? 55}
            onChange={(e) => handleChange({ bloodPressureSystolic: parseFloat(e.target.value) })}
            className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-rose-500"
          />
        </div>

        {/* Diastolic BP Slider */}
        <div className="flex flex-col gap-2">
          <div className="flex justify-between text-xs">
            <label className="text-slate-400">Diastolic BP (mmHg)</label>
            <span className="text-rose-400 font-mono">{Math.round(r.bloodPressureDiastolic ?? 35)}</span>
          </div>
          <input
            type="range"
            min="20"
            max="80"
            step="1"
            value={r.bloodPressureDiastolic ?? 35}
            onChange={(e) => handleChange({ bloodPressureDiastolic: parseFloat(e.target.value) })}
            className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-rose-500"
          />
        </div>
      </div>
    </div>
  );
};
