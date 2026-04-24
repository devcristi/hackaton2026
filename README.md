# 🍼 NeoGuard — Neonatal Digital Bio-Twin

> **Hackathon 2026 project** — A real-time **Physiological Digital Twin** of a newborn baby in an incubator, powered by IoT sensors, a FastAPI backend, and a Next.js 3D visualization dashboard.

NeoGuard ingests live data from physical sensors (ESP32 + Raspberry Pi), runs a clinical rules engine / ML stress-scoring model, and streams the baby's state to a **3D interactive twin** in the browser via WebSockets / SSE.

---

## 🏗️ Architecture

```
┌──────────────┐     ┌────────────────┐     ┌──────────────────┐
│   ESP32      │ ──► │  Raspberry Pi  │ ──► │   Next.js Web    │
│  (sensors)   │HTTP │  FastAPI + ML  │ SSE │   3D Bio-Twin    │
└──────────────┘     └────────────────┘     └──────────────────┘
      │                     │                       │
   Temp, HR,           Rules engine,           Recharts + R3F
   SpO2, Air, …        SQLite storage          (Three.js)
```

### Monorepo layout

| Path                      | Stack                                  | Purpose                                     |
| ------------------------- | -------------------------------------- | ------------------------------------------- |
| [`apps/web`](apps/web)    | Next.js 15 · TS · Tailwind · R3F       | Digital twin dashboard (3D + charts)        |
| [`apps/pi`](apps/pi)      | Python 3.10+ · FastAPI · SQLite        | Ingest API, rules engine, SSE stream        |
| [`apps/esp32`](apps/esp32)| C++ · PlatformIO                       | Firmware for sensor node                    |
| [`apps/scripts`](apps/scripts) | Python                            | NIfTI → 3D mesh conversion utilities        |

---

## 🧰 Prerequisites

Install these **before** running the project:

| Tool           | Version     | Purpose                   | Download                                            |
| -------------- | ----------- | ------------------------- | --------------------------------------------------- |
| **Node.js**    | ≥ 20.x      | Frontend runtime          | https://nodejs.org                                  |
| **npm**        | ≥ 10.x      | Frontend deps (bundled)   | (bundled with Node)                                 |
| **Python**     | ≥ 3.10      | Backend + ML              | https://www.python.org/downloads                    |
| **pip**        | latest      | Python packages           | (bundled with Python)                               |
| **Git**        | any         | Version control           | https://git-scm.com                                 |
| **PlatformIO** | optional    | Flash ESP32 firmware      | https://platformio.org/install/cli                  |
| **Make**       | optional    | Run `make dev` shortcuts  | Windows: `choco install make`                       |

> 💡 On Windows you can run [`install-tools.ps1`](install-tools.ps1) or [`install-manual.bat`](install-manual.bat) to bootstrap everything at once.

---

## 🚀 Quick Start (TL;DR)

```bash
# 1. Clone
git clone https://github.com/devcristi/hackaton2026.git
cd hackaton2026

# 2. Install everything
make install          # or run the two commands below manually

# 3. Run full demo (backend + frontend + mock sensors)
make demo
```

Open **http://localhost:3000** → you should see the live 3D Bio-Twin.

---

## 📦 Installation (manual)

### Backend — FastAPI (Raspberry Pi / local)

```bash
cd apps/pi

# (optional but recommended) create virtual env
python -m venv .venv
# Windows
.venv\Scripts\activate
# macOS / Linux
source .venv/bin/activate

pip install -r requirements.txt
```

Dependencies installed:
- `fastapi` — REST + SSE framework
- `uvicorn[standard]` — ASGI server
- `pydantic` — data validation
- `sse-starlette` — Server-Sent Events

### Frontend — Next.js

```bash
cd apps/web
npm install
```

Key dependencies:
- `next@15` + `react@19` — app framework
- `tailwindcss` — styling
- `recharts` — live charts (EKG, vitals)
- `three` + `@react-three/fiber` + `@react-three/drei` — 3D twin
- `zustand` — state store
- `nifti-reader-js` — parse medical NIfTI volumes

### Firmware — ESP32 (optional)

```bash
cd apps/esp32
pio run --target upload   # flashes the connected ESP32
```

---

## ▶️ Running the stack

You need **3 terminals** (or use `make demo` which does it all):

### Terminal 1 — Backend API

```bash
cd apps/pi
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

Runs on → **http://localhost:8000**
- `GET  /health` — health check
- `POST /ingest` — push sensor payload
- `GET  /stream` — SSE live feed
- `GET  /latest` — last known snapshot
- Swagger UI → **http://localhost:8000/docs**

Windows shortcut: [`start-backend.bat`](start-backend.bat)

### Terminal 2 — Frontend

```bash
cd apps/web
npm run dev
```

Runs on → **http://localhost:3000**

Windows shortcut: [`start-frontend.bat`](start-frontend.bat)

> 💡 **Frontend Mock Mode:** If you want to run the frontend **without any backend**, use `make web-mock`. This will generate realistic sensor data directly in the browser.

### Terminal 3 — Sensor simulator (if no real hardware)

```bash
cd apps/pi
python -m hardware_mock.sensor_simulator --scenario normal
```

Available scenarios:

| Scenario      | Command                         | Description                    |
| ------------- | ------------------------------- | ------------------------------ |
| `normal`      | `make mock`                     | Healthy baseline               |
| `heaterFail`  | `make mock-heat`                | Incubator heater failure       |
| `lidOpen`     | `make mock-lid`                 | Incubator lid left open        |
| `poorAir`     | `make mock-aq`                  | Poor air quality alert         |
| `vibration`   | `make mock-vib`                 | Abnormal vibration detection   |

Windows shortcut: [`start-mock.bat`](start-mock.bat)

---

## 🧪 Useful `make` targets

```bash
make install     # install backend + frontend deps
make dev         # run backend + frontend in parallel
make api         # backend only
make web         # frontend only
make mock        # sensor simulator (normal)
make flash       # flash ESP32 firmware via PlatformIO
make demo        # install + run everything (for judges)
make clean       # remove __pycache__ / *.pyc
```

---

## 🌐 Environment variables

Create [`apps/web/.env.local`](apps/web/.env.local.example) (copy from the example):

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

If the Pi runs on a different host (e.g. real Raspberry Pi on LAN):

```env
NEXT_PUBLIC_API_URL=http://192.168.1.42:8000
```

See [`apps/web/README-CONNECT-TO-PI.md`](apps/web/README-CONNECT-TO-PI.md) for details on connecting the web app to a physical Pi.

---

## 🧩 Tech Stack Recap

**Frontend**
- Next.js 15 (App Router) · React 19 · TypeScript 5
- Tailwind CSS 3
- Recharts (EKG / vitals)
- React Three Fiber + Drei (3D baby / heart mesh)
- Zustand (client state)

**Backend**
- FastAPI · Pydantic v2
- SSE streaming (`sse-starlette`)
- SQLite persistence
- Rules engine driven by [`apps/pi/data/clinical-rules.json`](apps/pi/data/clinical-rules.json)

**Hardware**
- ESP32 (temperature, heart rate, SpO₂, air quality, accelerometer)
- Raspberry Pi 4 (gateway running FastAPI)

---

## 📁 Additional docs

- [`QUICK-START.md`](QUICK-START.md) — 2-minute local startup guide
- [`README-INSTALL.md`](README-INSTALL.md) — full install walkthrough
- [`apps/pi/QUICK-START-PI.md`](apps/pi/QUICK-START-PI.md) — Raspberry Pi setup
- [`apps/pi/README-PI-SETUP.md`](apps/pi/README-PI-SETUP.md) — deep Pi config
- [`plans/neonatal-digital-twin-plan.md`](plans/neonatal-digital-twin-plan.md) — architecture & roadmap

---

## 🏆 Hackathon Team — `devcristi/hackaton2026`

Built with ❤️ for Hackathon 2026.

## 📄 License

MIT
