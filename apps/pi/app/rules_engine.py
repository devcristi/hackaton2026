"""
Infant physiological rules engine.
Returns severity level and list of active rule names.
"""
from __future__ import annotations
from .models import SensorReading, Severity

# --- Physiological Thresholds (Preterm Newborn) ---
# BPM (Heart Rate) - Normal: 120-160 for preterm
BPM_MIN = 120.0
BPM_MAX = 160.0
BPM_CRIT_LOW = 100.0
BPM_CRIT_HIGH = 200.0

# Blood Pressure (mmHg) - Preterm approx 40-60 / 25-45
BP_SYS_MIN = 40.0
BP_SYS_MAX = 70.0
BP_DIA_MIN = 25.0
BP_DIA_MAX = 50.0

# SpO2 (Oxygen Saturation) - Normal Preterm: 88-94% (avoid >96%)
SPO2_WARN_LOW = 88.0
SPO2_CRIT_LOW = 84.0
SPO2_WARN_HIGH = 96.0
SPO2_CRIT_HIGH = 98.0

# --- Physical Thresholds ---
LIGHT_LUX_HIGH = 1000.0
LID_OPEN_CM = 5.0
HEATER_MIN_A = 0.1
VIBRATION_G_WARN = 0.4
VIBRATION_G_CRIT = 1.0


def _max_accel(r: SensorReading) -> float:
    ax = r.accelX or 0.0
    ay = r.accelY or 0.0
    az = (r.accelZ or 1.0) - 1.0  # subtract gravity
    return max(abs(ax), abs(ay), abs(az))


def classify(reading: SensorReading) -> tuple[Severity, list[str]]:
    rules: list[str] = []
    worst: int = 0  # 0=normal 1=watch 2=alert 3=critical

    def flag(name: str, level: int) -> None:
        nonlocal worst
        rules.append(name)
        worst = max(worst, level)

    # --- Heart Rate (BPM) ---
    bpm = reading.bpm
    if bpm is not None:
        if bpm < BPM_CRIT_LOW:
            flag("bradycardia_critical", 3)
        elif bpm < BPM_MIN:
            flag("bradycardia", 2)
        elif bpm > BPM_CRIT_HIGH:
            flag("tachycardia_critical", 3)
        elif bpm > BPM_MAX:
            flag("tachycardia", 2)

    # --- Blood Pressure ---
    sys = reading.bloodPressureSystolic
    dia = reading.bloodPressureDiastolic
    if sys is not None:
        if sys < BP_SYS_MIN:
            flag("lowSystolicBP", 2)
        elif sys > BP_SYS_MAX:
            flag("highSystolicBP", 1)
    if dia is not None:
        if dia < BP_DIA_MIN:
            flag("lowDiastolicBP", 2)
        elif dia > BP_DIA_MAX:
            flag("highDiastolicBP", 1)

    # --- SpO2 ---
    spo2 = reading.spO2
    if spo2 is not None:
        if spo2 < SPO2_CRIT_LOW:
            flag("hypoxia_critical", 3)
        elif spo2 < SPO2_WARN_LOW:
            flag("hypoxia", 2)
        elif spo2 > SPO2_CRIT_HIGH:
            flag("hyperoxia_critical", 3)
        elif spo2 > SPO2_WARN_HIGH:
            flag("hyperoxia", 1)

    # --- Light ---
    lux = reading.lightLux
    if lux is not None and lux > LIGHT_LUX_HIGH:
        flag("brightLight", 1)

    # --- Lid ---
    lid = reading.lidDistanceCm
    if lid is not None and lid > LID_OPEN_CM:
        flag("lidOpen", 2)

    # --- Heater ---
    current = reading.heaterCurrentA
    if current is not None:
        if current < HEATER_MIN_A:
            flag("heaterOff", 1)

    # --- Vibration ---
    vib = _max_accel(reading)
    if vib > VIBRATION_G_CRIT:
        flag("severeVibration", 3)
    elif vib > VIBRATION_G_WARN:
        flag("vibration", 2)

    severity_map: dict[int, Severity] = {0: "normal", 1: "watch", 2: "alert", 3: "critical"}
    return severity_map[worst], rules
