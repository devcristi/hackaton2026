// ─── Sensor Reading (mirrors ESP32 + backend models.py) ───────────────────────

export type SensorReading = {
  ts: number;

  // --- Physical Sensors (from logs) ---
  airTempC: number | null;        // T
  humidityPct: number | null;     // H
  airQualityRaw: number | null;   // AQ
  lightRaw: number | null;        // L
  lidDistanceCm: number | null;   // D
  heaterCurrentA: number | null;  // I

  // MPU6050
  accelX: number | null;          // A
  accelY: number | null;
  accelZ: number | null;
  mpuTempC: number | null;

  // --- Statuses & Risk ---
  riskScore: number | null;       // risk
  espStatus: string | null;       // esp
  piStatus: string | null;        // pi
  fanStatus: string | null;       // fan

  // --- Simulated Physiological Sensors (Infant) ---
  bpm: number | null;
  bloodPressureSystolic: number | null;
  bloodPressureDiastolic: number | null;
  spO2: number | null;

  // SG90
  servoAngleDeg: number | null;
  lidOpen: boolean | null;
};

// ─── Severity ──────────────────────────────────────────────────────────────

export type Severity = "normal" | "watch" | "alert" | "critical";

// ─── Full Twin State ────────────────────────────────────────────────────────

export type TwinState = {
  reading: SensorReading;
  severity: Severity;
  activeRules: string[];
  servoCommand: number;
};

// ─── What-If ────────────────────────────────────────────────────────────────

export type WhatIfPreset =
  | "hyperthermia"
  | "heaterFail"
  | "lidOpen"
  | "sensorFail"
  | "ventBlocked";

export type WhatIfRequest = {
  overrides?: Partial<SensorReading>;
  horizonSec?: number;
  preset?: WhatIfPreset;
};

export type TrajectoryPoint = {
  step: number;
  ts: number;
  bpm: number;
  sys: number;
  dia: number;
  spO2: number;
  severity: Severity;
  rules: string[];
};

export type WhatIfResponse = {
  trajectory: TrajectoryPoint[];
  summary: string;
  timeToRiskSec: number | null;
};

// ─── Severity helpers ───────────────────────────────────────────────────────

export const SEVERITY_COLORS: Record<Severity, string> = {
  normal:   "text-emerald-400",
  watch:    "text-yellow-400",
  alert:    "text-orange-400",
  critical: "text-red-500",
};

export const SEVERITY_BG: Record<Severity, string> = {
  normal:   "bg-emerald-900/30 border-emerald-700",
  watch:    "bg-yellow-900/30 border-yellow-700",
  alert:    "bg-orange-900/30 border-orange-700",
  critical: "bg-red-900/40 border-red-600 animate-pulse",
};
