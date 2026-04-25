"""
Hardware mock – simulates physical sensors (HC, LDR, ACS, MPU) and vitals (BPM, BP, SpO2).
Posts to FastAPI /ingest at 1 Hz.
"""
from __future__ import annotations
import math
import random
import time
import argparse
import urllib.request
import urllib.error
import json

API_URL = "https://residency-resistant-perfected.ngrok-free.dev/health"

# Physiological base values (Infant)
BPM_BASE = 140.0
SYS_BASE = 55.0
DIA_BASE = 35.0
SPO2_BASE = 92.0

# Current simulated state for slow variations
_state = {
    "bpm": BPM_BASE,
    "sys": SYS_BASE,
    "dia": DIA_BASE,
    "spo2": SPO2_BASE
}

def _sin_wave(t: float, period: float, offset: float, amplitude: float, base: float) -> float:
    return base + amplitude * math.sin(2 * math.pi * t / period + offset)

def generate_reading(t: float, scenario: str = "normal") -> dict:
    global _state
    ts = int(time.time())

    # --- Slow Physiological Variations (Random Walk) ---
    # Very slight variations to stay within the tight ranges
    _state["bpm"] += random.uniform(-0.05, 0.05)
    _state["sys"] += random.uniform(-0.02, 0.02)
    _state["dia"] += random.uniform(-0.02, 0.02)
    _state["spo2"] += random.uniform(-0.01, 0.01)

    # Clamping (Preterm Normal Ranges)
    _state["bpm"] = max(138.0, min(142.0, _state["bpm"]))
    _state["sys"] = max(53.0, min(57.0, _state["sys"]))
    _state["dia"] = max(33.0, min(37.0, _state["dia"]))
    _state["spo2"] = max(91.0, min(93.0, _state["spo2"]))

    # --- Physical Sensors ---
    # LDR
    light_raw = int(_sin_wave(t, 60, 0, 500, 1000) + random.gauss(0, 20))
    light_lux = light_raw * 0.5 # Simplified lux conversion

    # HC-SR04
    lid_distance = 2.0 + random.gauss(0, 0.1)
    lid_open = lid_distance > 5.0

    # MPU6050
    accel_x = random.gauss(0, 0.02)
    accel_y = random.gauss(0, 0.02)
    accel_z = 1.0 + random.gauss(0, 0.02)
    gyro_x  = random.gauss(0, 0.2)
    gyro_y  = random.gauss(0, 0.2)
    gyro_z  = random.gauss(0, 0.2)
    mpu_temp = 36.5 + random.gauss(0, 0.1)

    # ACS712
    heater_current = 0.52 + random.gauss(0, 0.01)
    heater_active = heater_current > 0.1

    # --- Scenarios ---
    if scenario == "bradycardia":
        _state["bpm"] = 85.0 + random.uniform(-1, 1)
        _state["spo2"] = 92.0 + random.uniform(-0.5, 0.5)
    elif scenario == "lidOpen":
        lid_distance = 15.0 + random.gauss(0, 0.5)
        lid_open = True
    elif scenario == "vibration":
        accel_x = random.gauss(0, 0.5)
        accel_y = random.gauss(0, 0.5)

    return {
        "ts": ts,
        "bpm": round(_state["bpm"], 1),
        "bloodPressureSystolic": round(_state["sys"], 1),
        "bloodPressureDiastolic": round(_state["dia"], 1),
        "spO2": round(_state["spo2"], 1),
        "lightRaw": light_raw,
        "lightLux": round(light_lux, 1),
        "lidDistanceCm": round(lid_distance, 1),
        "lidOpen": lid_open,
        "accelX": round(accel_x, 4),
        "accelY": round(accel_y, 4),
        "accelZ": round(accel_z, 4),
        "gyroX": round(gyro_x, 2),
        "gyroY": round(gyro_y, 2),
        "gyroZ": round(gyro_z, 2),
        "mpuTempC": round(mpu_temp, 2),
        "heaterCurrentA": round(heater_current, 4),
        "heaterActive": heater_active,
        "servoAngleDeg": 0
    }

def post(payload: dict) -> int:
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        API_URL,
        data=data,
        headers={
            "Content-Type": "application/json",
            "ngrok-skip-browser-warning": "1",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=3) as resp:
            return resp.status
    except urllib.error.URLError:
        return 0

def main() -> None:
    parser = argparse.ArgumentParser(description="NeoTwin sensor simulator")
    parser.add_argument("--scenario", default="normal", choices=["normal", "bradycardia", "lidOpen", "vibration"], help="Scenario to simulate")
    parser.add_argument("--hz", type=float, default=1.0, help="Posts per second")
    args = parser.parse_args()

    interval = 1.0 / args.hz
    print(f"[NeoTwin Mock] scenario={args.scenario} rate={args.hz}Hz")

    t = 0.0
    while True:
        reading = generate_reading(t, args.scenario)
        status = post(reading)
        print(f"  t={t:6.0f}s | BPM={reading['bpm']} SpO2={reading['spO2']}% BP={reading['bloodPressureSystolic']}/{reading['bloodPressureDiastolic']} lid={reading['lidDistanceCm']}cm -> {status}")
        t += interval
        time.sleep(interval)

if __name__ == "__main__":
    main()
