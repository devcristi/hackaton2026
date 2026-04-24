"use client";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import type { SensorReading } from "../../lib/types";

type Props = { history: SensorReading[] };

export const LiveChart = ({ history }: Props) => {
  const data = history.map((r) => ({
    t: new Date(r.ts * 1000).toLocaleTimeString(),
    "HR (bpm)": r.bpm?.toFixed(0),
    "SpO2 (%)": r.spO2?.toFixed(0),
    "BP Sys": r.bloodPressureSystolic?.toFixed(0),
    "BP Dia": r.bloodPressureDiastolic?.toFixed(0),
  }));

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900 p-4">
      <p className="text-xs text-slate-400 uppercase tracking-wider mb-3">Vitals History (last 5 min)</p>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis dataKey="t" tick={{ fill: "#94a3b8", fontSize: 10 }} interval="preserveStartEnd" />
          <YAxis tick={{ fill: "#94a3b8", fontSize: 10 }} />
          <Tooltip
            contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 8 }}
            labelStyle={{ color: "#94a3b8" }}
          />
          <Legend wrapperStyle={{ fontSize: 11, color: "#94a3b8" }} />
          <Line type="monotone" dataKey="HR (bpm)" stroke="#f43f5e" dot={false} strokeWidth={2} />
          <Line type="monotone" dataKey="SpO2 (%)" stroke="#38bdf8" dot={false} strokeWidth={2} />
          <Line type="monotone" dataKey="BP Sys" stroke="#fbbf24" dot={false} strokeWidth={1.5} />
          <Line type="monotone" dataKey="BP Dia" stroke="#d946ef" dot={false} strokeWidth={1.5} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};
