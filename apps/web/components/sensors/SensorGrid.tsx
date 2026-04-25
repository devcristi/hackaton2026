"use client";
import type { TwinState } from "../../lib/types";
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
} from "../../lib/sensorSeverity";
import type { Severity } from "../../lib/types";

const RANK: Record<Severity, number> = { normal: 0, watch: 1, alert: 2, critical: 3 };
const worst = (a: Severity, b: Severity): Severity => (RANK[a] >= RANK[b] ? a : b);
import { SensorCard } from "./SensorCard";

type Props = { state: TwinState };

export const SensorGrid = ({ state }: Props) => {
  const r = state.reading;

  const fmt = (v: number | null | undefined, d = 1) =>
    v !== null && v !== undefined ? v.toFixed(d) : null;

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
      {/* Vitals */}
      <SensorCard
        label="Heart Rate"
        value={fmt(r.bpm, 0)}
        unit="bpm"
        severity={bpmSeverity(r.bpm)}
        sub="BPM"
      />
      <SensorCard
        label="Oxygen"
        value={fmt(r.spO2, 0)}
        unit="%"
        severity={spO2Severity(r.spO2)}
        sub="SpO₂"
      />
      <SensorCard
        label="Blood Pressure"
        value={`${fmt(r.bloodPressureSystolic, 0)}/${fmt(r.bloodPressureDiastolic, 0)}`}
        unit="mmHg"
        severity={worst(sysSeverity(r.bloodPressureSystolic), diaSeverity(r.bloodPressureDiastolic))}
        sub="SYS/DIA"
      />

      {/* Environment (from logs T, H, AQ, D) */}
      <SensorCard
        label="Air Temp"
        value={fmt(r.airTempC)}
        unit="°C"
        severity={airTempSeverity(r.airTempC)}
        sub="Temp (T)"
      />
      <SensorCard
        label="Humidity"
        value={fmt(r.humidityPct)}
        unit="%"
        severity={humiditySeverity(r.humidityPct)}
        sub="Hum (H)"
      />
      <SensorCard
        label="Air Quality"
        value={r.airQualityRaw}
        unit="raw"
        severity={airQualitySeverity(r.airQualityRaw)}
        sub="AQ"
      />
      <SensorCard
        label="Lid Distance"
        value={fmt(r.lidDistanceCm)}
        unit="cm"
        severity={lidSeverity(r.lidDistanceCm)}
        sub="Dist (D)"
      />

      {/* Mechanics & Risk (I, Risk) */}
      <SensorCard
        label="Heater Current"
        value={fmt(r.heaterCurrentA, 3)}
        unit="A"
        severity={heaterSeverity(r.heaterCurrentA)}
        sub="Current (I)"
      />
      <SensorCard
        label="Risk Score"
        value={fmt(r.riskScore)}
        unit=""
        severity={riskSeverity(r.riskScore)}
        sub="risk"
      />

      {/* Additional Stats */}
      <SensorCard
        label="System Status"
        value={r.espStatus}
        unit=""
        severity={r.espStatus !== "SAFE" ? "critical" : "normal"}
        sub={`PI: ${r.piStatus} | FAN: ${r.fanStatus}`}
      />
    </div>
  );
};
