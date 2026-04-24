# NeoGuard - Quick Start Guide ✅

## Status: TOATE SERVICIILE FUNCȚIONEAZĂ! 🎉

### Ce Rulează Acum

✅ **Backend API** - http://localhost:8000
- FastAPI cu uvicorn
- Primește date de la senzori
- Procesează reguli clinice

✅ **Mock Sensors** - Trimite date simulate
- Generează date de senzori în timp real
- Scenariul "normal" activ
- Trimite date la fiecare secundă

✅ **Frontend** - http://localhost:3000
- Next.js Digital Twin UI
- Afișează date în timp real
- Grafice și vizualizări

---

## Cum să Pornești Aplicația (Pentru Viitor)

### Opțiunea 1: Folosind Scripturile .bat (RECOMANDAT)

Deschide **3 terminale** în `d:\hackathon` și rulează:

```cmd
# Terminal 1 - Backend
start-backend.bat

# Terminal 2 - Mock Sensors
start-mock.bat

# Terminal 3 - Frontend
start-frontend.bat
```

### Opțiunea 2: Comenzi Manuale

```cmd
# Terminal 1 - Backend
cd apps\pi
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

# Terminal 2 - Mock Sensors
cd apps\pi
python -m hardware_mock.sensor_simulator --scenario normal

# Terminal 3 - Frontend
cd apps\web
npm run dev
```

---

## Accesare Aplicație

- **Frontend (Digital Twin UI)**: http://localhost:3000
- **Backend API Docs (Swagger)**: http://localhost:8000/docs
- **Backend Health Check**: http://localhost:8000/health

---

## Scenarii Mock Disponibile

Poți schimba scenariul mock sensors:

```cmd
# Scenariul normal (default)
cd apps\pi
python -m hardware_mock.sensor_simulator --scenario normal

# Scenariul heater fail
python -m hardware_mock.sensor_simulator --scenario heaterFail

# Scenariul lid open
python -m hardware_mock.sensor_simulator --scenario lidOpen

# Scenariul poor air quality
python -m hardware_mock.sensor_simulator --scenario poorAir

# Scenariul vibration
python -m hardware_mock.sensor_simulator --scenario vibration
```

---

## Troubleshooting

### Backend nu pornește
- Verifică că Python este instalat: `python --version`
- Reinstalează dependențele: `cd apps\pi && python -m pip install -r requirements.txt`

### Frontend nu pornește
- Verifică că Node.js este instalat: `node --version`
- Reinstalează dependențele: `cd apps\web && npm install`

### Mock sensors dă eroare
- Asigură-te că backend-ul rulează mai întâi
- Verifică că portul 8000 este liber

---

## Pentru Prezentare/Demo

1. Pornește toate 3 serviciile
2. Deschide http://localhost:3000 în browser
3. Observă datele în timp real pe dashboard
4. Schimbă scenariul mock pentru a demonstra alertele
5. Arată API docs la http://localhost:8000/docs

---

## Fișiere Importante

- [`Makefile`](Makefile) - Comenzi make (necesită instalare Make)
- [`install-manual.bat`](install-manual.bat) - Instalare dependențe
- [`start-backend.bat`](start-backend.bat) - Pornește backend
- [`start-mock.bat`](start-mock.bat) - Pornește mock sensors
- [`start-frontend.bat`](start-frontend.bat) - Pornește frontend
- [`README-INSTALL.md`](README-INSTALL.md) - Ghid complet de instalare

---

## Note Tehnice

- **Python**: 3.14.4 (instalat)
- **Node.js**: v22.14.0 (instalat)
- **Make**: Nu este instalat (folosim scripturi .bat)
- **Backend Framework**: FastAPI + Uvicorn
- **Frontend Framework**: Next.js 15 (App Router)
- **Data Viz**: Recharts
- **Real-time**: Server-Sent Events (SSE)

---

**Proiect NeoGuard - Hackathon 2026**
*Geamăn Digital Fiziologic pentru Monitorizare Neonatală*
