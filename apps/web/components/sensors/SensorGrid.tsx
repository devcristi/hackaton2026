"use client";
import type { TwinState } from "../../lib/types";
import { SensorCard } from "./SensorCard";

type Props = { state: TwinState };

export const SensorGrid = ({ state }: Props) => {
  const r = state.reading;
  const sev = state.severity;

  const fmt = (v: number | null | undefined, d = 1) =>
    v !== null && v !== undefined ? v.toFixed(d) : null;

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
      {/* Vitals */}
      <SensorCard
        label="Heart Rate"
        value={fmt(r.bpm, 0)}
        unit="bpm"
        severity={r.bpm && (r.bpm < 100 || r.bpm > 170) ? "alert" : "normal"}
        sub="BPM"
      />
      <SensorCard
        label="Oxygen"
        value={fmt(r.spO2, 0)}
        unit="%"
        severity={r.spO2 && r.spO2 < 94 ? "critical" : "normal"}
        sub="SpO₂"
      />
      <SensorCard
        label="Blood Pressure"
        value={`${fmt(r.bloodPressureSystolic, 0)}/${fmt(r.bloodPressureDiastolic, 0)}`}
        unit="mmHg"
        sub="SYS/DIA"
      />

      {/* Environment (from logs T, H, AQ, D) */}
      <SensorCard
        label="Air Temp"
        value={fmt(r.airTempC)}
        unit="°C"
        sub="Temp (T)"
      />
      <SensorCard
        label="Humidity"
        value={fmt(r.humidityPct)}
        unit="%"
        sub="Hum (H)"
      />
      <SensorCard
        label="Air Quality"
        value={r.airQualityRaw}
        unit="raw"
        sub="AQ"
      />
      <SensorCard
        label="Lid Distance"
        value={fmt(r.lidDistanceCm)}
        unit="cm"
        sub="Dist (D)"
      />

      {/* Mechanics & Risk (I, Risk) */}
      <SensorCard
        label="Heater Current"
        value={fmt(r.heaterCurrentA, 3)}
        unit="A"
        sub="Current (I)"
      />
      <SensorCard
        label="Risk Score"
        value={fmt(r.riskScore)}
        unit=""
        severity={r.riskScore && r.riskScore > 0.5 ? "alert" : "normal"}
        sub="risk"
      />

      {/* Additional Stats */}
      <SensorCard
        label="System Status"
        value={r.espStatus}
        unit=""
        severity={r.espStatus !== 'SAFE' ? 'critical' : 'normal'}
        sub={`PI: ${r.piStatus} | FAN: ${r.fanStatus}`}
      />
    </div>
  );
};
