import type { TwinState, SensorReading, Severity } from "./types";

export function generateMockReading(): SensorReading {
  const ts = Date.now() / 1000;
  
  return {
    ts,
    airTempC: 37.0,
    humidityPct: 55,
    airQualityRaw: 120,
    lightRaw: 550,
    lidDistanceCm: 2.0,   // closed lid — threshold is 5 cm
    heaterCurrentA: 0.5,
    accelX: 0,
    accelY: 0,
    accelZ: 1.0,          // g-units (gravity at rest), NOT m/s²
    mpuTempC: 37.2,
    riskScore: 0.05,      // 0–1 scale
    espStatus: "SAFE",
    piStatus: "OK",
    fanStatus: "OFF",
    bpm: 140,
    bloodPressureSystolic: 55,
    bloodPressureDiastolic: 35,
    spO2: 92.0,
    servoAngleDeg: 0,
    lidOpen: false,
  };
}

export function generateMockTwinState(): TwinState {
  return {
    reading: generateMockReading(),
    severity: "normal",
    activeRules: [],
    servoCommand: 0,
  };
}
