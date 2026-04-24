# NeoGuard - Ghid de Instalare Windows

## Problema Actuală
- ❌ Python nu este instalat
- ❌ Make nu este instalat  
- ✅ Node.js v22.14.0 este instalat

## Soluție 1: Instalare Automată (RECOMANDAT)

### Pasul 1: Instalează Python și Make

**Deschide PowerShell ca Administrator** (click dreapta pe Start → Windows PowerShell (Admin)) și rulează:

```powershell
cd d:\hackathon
.\install-tools.ps1
```

Acest script va instala automat:
- Chocolatey (package manager)
- Python 3.x
- Make

### Pasul 2: Închide și Redeschide VSCode

După instalare, **închide complet VSCode** și redeschide-l pentru a reîncărca variabilele de mediu.

### Pasul 3: Instalează Dependențele

În terminal (din `d:\hackathon`):

```cmd
make install
```

### Pasul 4: Pornește Aplicația

Deschide 3 terminale și rulează:

```cmd
make api    # Terminal 1 - Backend
make mock   # Terminal 2 - Mock Sensors  
make web    # Terminal 3 - Frontend
```

---

## Soluție 2: Instalare Manuală (Fără Make)

Dacă nu vrei să instalezi Make, poți folosi scripturile `.bat`:

### Pasul 1: Instalează Python Manual

Descarcă și instalează Python de la: https://www.python.org/downloads/

**IMPORTANT**: Bifează "Add Python to PATH" la instalare!

### Pasul 2: Instalează Dependențele

Rulează din `d:\hackathon`:

```cmd
install-manual.bat
```

### Pasul 3: Pornește Aplicația

Deschide 3 terminale și rulează:

```cmd
start-backend.bat   # Terminal 1 - Backend API
start-mock.bat      # Terminal 2 - Mock Sensors
start-frontend.bat  # Terminal 3 - Frontend
```

---

## Verificare Instalare

După instalare, verifică că totul funcționează:

```cmd
python --version    # Ar trebui să afișeze Python 3.x
make --version      # Ar trebui să afișeze GNU Make (dacă ai instalat)
node --version      # Ar trebui să afișeze v22.14.0
```

---

## Accesare Aplicație

După ce pornești toate serviciile:

- **Frontend (Digital Twin UI)**: http://localhost:3000
- **Backend API (Swagger Docs)**: http://localhost:8000/docs
- **Backend Health Check**: http://localhost:8000/health

---

## Troubleshooting

### "Python was not found"
- Asigură-te că ai instalat Python cu "Add to PATH" bifat
- Sau rulează `install-tools.ps1` ca Administrator

### "make is not recognized"
- Fie instalează Make cu `install-tools.ps1`
- Fie folosește scripturile `.bat` (start-backend.bat, etc.)

### "Module not found" în Python
- Rulează: `cd apps\pi && pip install -r requirements.txt`

### "npm ERR!" în Frontend
- Rulează: `cd apps\web && npm install`

---

## Pentru Hackathon (Quick Start)

Cea mai rapidă metodă pentru demo:

1. Instalează Python manual (cu Add to PATH)
2. Rulează `install-manual.bat`
3. Deschide 3 terminale și rulează scripturile `.bat`
4. Accesează http://localhost:3000

**Timp estimat**: 5-10 minute
