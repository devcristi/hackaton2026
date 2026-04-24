@echo off
REM NeoGuard - Pornește Mock Sensors
cd apps\pi
echo === Starting Mock Sensors (Normal Scenario) ===
python -m hardware_mock.sensor_simulator --scenario normal
