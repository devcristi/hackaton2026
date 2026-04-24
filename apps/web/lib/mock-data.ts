import type { TwinState, SensorReading, Severity } from "./types";

export function generateMockReading(): SensorReading {
  const ts = Date.now() / 1000;
  
  return {
    ts,
    airTempC: 37.0,
    humidityPct: 50,
    airQualityRaw: 120,
    lightRaw: 550,
    lidDistanceCm: 21,
    heaterCurrentA: 0.6,
    accelX: 0,
    accelY: 0,
    accelZ: 9.81,
    mpuTempC: 37.2,
    riskScore: 5,
    espStatus: "OK",
    piStatus: "OK",
    fanStatus: "OFF",
    bpm: 125,
    bloodPressureSystolic: 75,
    bloodPressureDiastolic: 48,
    spO2: 98,
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
