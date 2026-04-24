@echo off
REM NeoGuard - Pornește Backend API (FastAPI)
cd apps\pi
echo === Starting FastAPI Backend on http://localhost:8000 ===
echo.
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
