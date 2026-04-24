"""
Infant physiological and incubator simulator.
Simulates slow-varying vitals: heart rate, blood pressure, and oxygen saturation.
"""
from __future__ import annotations
import time
import random
from .models import SensorReading, WhatIfRequest, WhatIfResponse
from .rules_engine import classify

# Physiological Defaults (Infant)
BPM_TARGET = 125.0
SYS_TARGET = 75.0
DIA_TARGET = 45.0
SPO2_TARGET = 98.0

# Slow-variation factors (per second)
VARIATION_SPEED = 0.05 


def run_what_if(request: WhatIfRequest, base: SensorReading) -> WhatIfResponse:
    overrides = dict(request.overrides)
    
    # Clone base reading with overrides
    base_dict = base.model_dump()
    base_dict.update({k: v for k, v in overrides.items() if v is not None})

    bpm = base_dict.get("bpm") or BPM_TARGET
    sys = base_dict.get("bloodPressureSystolic") or SYS_TARGET
    dia = base_dict.get("bloodPressureDiastolic") or DIA_TARGET
    spo2 = base_dict.get("spO2") or SPO2_TARGET

    horizon = request.horizonSec
    trajectory: list[dict] = []
    time_to_risk: int | None = None
    ts_now = int(time.time())

    for step in range(horizon):
        # Simulate slow variations (random walk)
        bpm += random.uniform(-VARIATION_SPEED, VARIATION_SPEED)
        sys += random.uniform(-VARIATION_SPEED * 0.5, VARIATION_SPEED * 0.5)
        dia += random.uniform(-VARIATION_SPEED * 0.3, VARIATION_SPEED * 0.3)
        spo2 += random.uniform(-0.01, 0.01)

        # Clamping to realistic infant ranges
        bpm = max(60, min(220, bpm))
        sys = max(30, min(120, sys))
        dia = max(20, min(80, dia))
        spo2 = max(70, min(100, spo2))

        if step % 5 == 0:  # sample every 5s
            sim_reading = SensorReading(
                ts=ts_now + step,
                bpm=round(bpm, 1),
                bloodPressureSystolic=round(sys, 1),
                bloodPressureDiastolic=round(dia, 1),
                spO2=round(spo2, 1),
                heaterCurrentA=base_dict.get("heaterCurrentA"),
                heaterActive=base_dict.get("heaterActive"),
                lidDistanceCm=base_dict.get("lidDistanceCm"),
                lidOpen=base_dict.get("lidOpen"),
                servoAngleDeg=base_dict.get("servoAngleDeg"),
            )
            severity, rules = classify(sim_reading)
            trajectory.append({
                "step": step,
                "ts": ts_now + step,
                "bpm": round(bpm, 1),
                "sys": round(sys, 1),
                "dia": round(dia, 1),
                "spO2": round(spo2, 1),
                "severity": severity,
                "rules": rules,
            })

            if time_to_risk is None and severity == "critical":
                time_to_risk = step

    # Summary
    summary = f"Vitals simulated for {horizon}s. Final BPM: {round(bpm, 1)}, SpO2: {round(spo2, 1)}%."
    if time_to_risk is not None:
        summary += f" Critical state reached at {time_to_risk}s."

    return WhatIfResponse(
        trajectory=trajectory,
        summary=summary,
        timeToRiskSec=time_to_risk,
    )
