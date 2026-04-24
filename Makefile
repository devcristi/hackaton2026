# ─── NeoTwin top-level Makefile ───────────────────────────────────────────────
# Usage:
#   make install   – install all deps (web + Python)
#   make dev       – start both backend and frontend in parallel
#   make api       – start FastAPI backend only
#   make web       – start Next.js frontend only
#   make mock      – run hardware simulator (normal scenario)
#   make mock-heat – run heater-fail scenario
#   make mock-lid  – run lid-open scenario
#   make flash     – compile & flash ESP32 via PlatformIO
#   make demo      – install + dev (one command for judges)

PYTHON   ?= python3
PIP      ?= pip3
API_DIR  := apps/pi
WEB_DIR  := apps/web
ESP_DIR  := apps/esp32

.PHONY: install dev api web mock mock-heat mock-lid flash demo clean

install:
	@echo ">>> Installing Python backend deps..."
	cd $(API_DIR) && $(PIP) install -r requirements.txt
	@echo ">>> Installing Node frontend deps..."
	cd $(WEB_DIR) && npm install

dev: install
	@echo ">>> Starting NeoTwin (backend + frontend)..."
	$(MAKE) -j2 api web

api:
	@echo ">>> FastAPI on :8000"
	cd $(API_DIR) && uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

web:
	@echo ">>> Next.js on :3000"
	cd $(WEB_DIR) && npm run dev

web-mock:
	@echo ">>> Next.js on :3000 (MOCK MODE - no backend needed)"
	cd $(WEB_DIR) && set NEXT_PUBLIC_MOCK_MODE=true&& npm run dev

mock:
	@echo ">>> Sensor mock [normal] → http://localhost:8000/ingest"
	cd $(API_DIR) && $(PYTHON) -m hardware_mock.sensor_simulator --scenario normal

mock-heat:
	cd $(API_DIR) && $(PYTHON) -m hardware_mock.sensor_simulator --scenario heaterFail

mock-lid:
	cd $(API_DIR) && $(PYTHON) -m hardware_mock.sensor_simulator --scenario lidOpen

mock-aq:
	cd $(API_DIR) && $(PYTHON) -m hardware_mock.sensor_simulator --scenario poorAir

mock-vib:
	cd $(API_DIR) && $(PYTHON) -m hardware_mock.sensor_simulator --scenario vibration

flash:
	@echo ">>> Flashing ESP32 via PlatformIO..."
	cd $(ESP_DIR) && pio run --target upload

demo: install
	@echo ">>> DEMO MODE – backend + mock data"
	$(MAKE) -j2 api mock

clean:
	find . -type d -name __pycache__ -exec rmdir /s /q {} + 2>nul || true
	find . -name "*.pyc" -delete 2>/dev/null || true
