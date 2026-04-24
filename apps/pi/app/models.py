from __future__ import annotations
from typing import Literal, Optional
from pydantic import BaseModel, Field


class SensorReading(BaseModel):
    ts: int = Field(..., description="UNIX timestamp (seconds)")

    # --- Physical Sensors (from logs) ---
    airTempC: Optional[float] = None        # T
    humidityPct: Optional[float] = None     # H
    airQualityRaw: Optional[int] = None     # AQ
    lightRaw: Optional[int] = None          # L
    lidDistanceCm: Optional[float] = None   # D
    heaterCurrentA: Optional[float] = None  # I
    
    # MPU6050
    accelX: Optional[float] = None          # A (mapping A to accelX for now)
    accelY: Optional[float] = None
    accelZ: Optional[float] = None
    mpuTempC: Optional[float] = None

    # --- Statuses & Risk ---
    riskScore: Optional[float] = 0.0        # risk
    espStatus: Optional[str] = "SAFE"       # esp
    piStatus: Optional[str] = "SAFE"        # pi
    fanStatus: Optional[str] = "OFF"        # fan

    # --- Simulated Physiological Sensors (Infant) ---
    bpm: Optional[float] = Field(None, description="Heart rate (bpm)")
    bloodPressureSystolic: Optional[float] = Field(None, description="Systolic BP (mmHg)")
    bloodPressureDiastolic: Optional[float] = Field(None, description="Diastolic BP (mmHg)")
    spO2: Optional[float] = Field(None, description="Oxygen saturation (%)")

    # Shared actuator state
    servoAngleDeg: Optional[int] = 0
    lidOpen: Optional[bool] = None


Severity = Literal["normal", "watch", "alert", "critical"]


class TwinState(BaseModel):
    reading: SensorReading
    severity: Severity
    activeRules: list[str]
    servoCommand: int = 0


class WhatIfRequest(BaseModel):
    overrides: dict = Field(default_factory=dict)
    horizonSec: int = 300
    preset: Optional[
        Literal["hyperthermia", "heaterFail", "lidOpen", "sensorFail", "ventBlocked"]
    ] = None


class WhatIfResponse(BaseModel):
    trajectory: list[dict]
    summary: str
    timeToRiskSec: Optional[int] = None


class IngestResponse(BaseModel):
    ok: bool = True
    servoAngleDeg: int = 0
