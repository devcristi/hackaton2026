import type { Severity } from "./types";

// ─── Per-sensor severity helpers ────────────────────────────────────────────
// Thresholds mirror apps/pi/data/clinical-rules.json (AAP-2022-simplified)

/** Heart rate – neonatal normal 110-160 bpm */
export function bpmSeverity(bpm: number | null | undefined): Severity {
  if (bpm === null || bpm === undefined) return "normal";
  if (bpm < 80 || bpm > 200) return "critical";
  if (bpm < 100 || bpm > 180) return "alert";
  if (bpm < 110 || bpm > 160) return "watch";
  return "normal";
}

/** Peripheral oxygen saturation – target 88-95 % (preterm) */
export function spO2Severity(spO2: number | null | undefined): Severity {
  if (spO2 === null || spO2 === undefined) return "normal";
  if (spO2 < 80) return "critical";
  if (spO2 < 88) return "alert";
  if (spO2 < 90 || spO2 > 97) return "watch";
  return "normal";
}

/** Systolic blood pressure – neonatal normal ~50-70 mmHg (preterm) */
export function sysSeverity(sys: number | null | undefined): Severity {
  if (sys === null || sys === undefined) return "normal";
  if (sys < 35 || sys > 100) return "critical";
  if (sys < 45 || sys > 90)  return "alert";
  if (sys < 50 || sys > 75)  return "watch";
  return "normal";
}

/** Diastolic blood pressure – neonatal normal ~25-45 mmHg (preterm) */
export function diaSeverity(dia: number | null | undefined): Severity {
  if (dia === null || dia === undefined) return "normal";
  if (dia < 15 || dia > 65) return "critical";
  if (dia < 20 || dia > 55) return "alert";
  if (dia < 25 || dia > 45) return "watch";
  return "normal";
}

/** Incubator air temperature – normal 32-37 °C */
export function airTempSeverity(tempC: number | null | undefined): Severity {
  if (tempC === null || tempC === undefined) return "normal";
  if (tempC < 28 || tempC > 40) return "critical";
  if (tempC < 30 || tempC > 38) return "alert";
  if (tempC < 32 || tempC > 37) return "watch";
  return "normal";
}

/** Relative humidity – normal 50-60 % */
export function humiditySeverity(pct: number | null | undefined): Severity {
  if (pct === null || pct === undefined) return "normal";
  if (pct < 30 || pct > 85) return "critical";
  if (pct < 40 || pct > 75) return "alert";
  if (pct < 50 || pct > 60) return "watch";
  return "normal";
}

/** Air quality raw ADC – warning 1500, critical 2500 ppm-approx */
export function airQualitySeverity(raw: number | null | undefined): Severity {
  if (raw === null || raw === undefined) return "normal";
  if (raw >= 2500) return "critical";
  if (raw >= 1500) return "alert";
  if (raw >= 1000) return "watch";
  return "normal";
}

/** Lid distance – threshold 5 cm (lid open = bad) */
export function lidSeverity(cm: number | null | undefined): Severity {
  if (cm === null || cm === undefined) return "normal";
  if (cm > 20) return "critical";
  if (cm > 10) return "alert";
  if (cm > 5)  return "watch";
  return "normal";
}

/** Heater current – nominal > 0.1 A; low current = heater off or failing */
export function heaterSeverity(amps: number | null | undefined): Severity {
  if (amps === null || amps === undefined) return "normal";
  if (amps < 0.02) return "critical";
  if (amps < 0.1)  return "alert";
  if (amps < 0.15) return "watch";
  return "normal";
}

/** Risk score 0-1 */
export function riskSeverity(score: number | null | undefined): Severity {
  if (score === null || score === undefined) return "normal";
  if (score > 0.75) return "critical";
  if (score > 0.5)  return "alert";
  if (score > 0.25) return "watch";
  return "normal";
}
