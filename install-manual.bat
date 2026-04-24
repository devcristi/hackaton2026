@echo off
REM NeoGuard - Instalare manuală dependențe (fără Make)
REM Rulează acest script din d:\hackathon

echo === NeoGuard Manual Install ===
echo.

echo [1/3] Instalare dependențe Python...
cd apps\pi
python -m pip install -r requirements.txt
if %errorlevel% neq 0 (
    echo EROARE: Instalarea dependențelor Python a eșuat!
    pause
    exit /b 1
)
cd ..\..
echo ✓ Dependențe Python instalate!
echo.

echo [2/3] Instalare dependențe Node.js...
cd apps\web
call npm install
if %errorlevel% neq 0 (
    echo EROARE: npm install a eșuat!
    pause
    exit /b 1
)
cd ..\..
echo ✓ Dependențe Node.js instalate!
echo.

echo === INSTALARE COMPLETĂ ===
echo.
echo Pentru a porni aplicația, deschide 3 terminale și rulează:
echo   Terminal 1: cd apps\pi ^&^& python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
echo   Terminal 2: cd apps\pi ^&^& python -m hardware_mock.sensor_simulator --scenario normal
echo   Terminal 3: cd apps\web ^&^& npm run dev
echo.
pause
