# Conectarea Frontend-ului la Raspberry Pi

## Situația Actuală

Ai 3 componente care rulează pe laptop:
- ✅ **Backend FastAPI** (Terminal 1) - `http://localhost:8000`
- ✅ **Mock Simulator** (Terminal 2) - trimite date simulate
- ✅ **Frontend Next.js** (Terminal 3) - `http://localhost:3000`

## Configurare pentru Raspberry Pi

### Pasul 1: Pornește Backend-ul pe Pi

Pe Raspberry Pi, rulează:

```bash
cd ~/hackathon/apps/pi
bash setup-pi-env.sh    # Prima dată, pentru setup
bash start-server.sh    # Pentru a porni serverul
```

Backend-ul va rula pe `http://PI_IP:8000`

### Pasul 2: Află IP-ul Raspberry Pi

Pe Pi, rulează:
```bash
hostname -I
# sau
ip addr show
```

Vei primi ceva de genul: `192.168.1.100` (IP-ul tău local)

### Pasul 3: Configurează Frontend-ul pe Laptop

În directorul `apps/web`, creează fișierul `.env.local`:

```bash
# Pe Windows (în directorul apps/web)
echo NEXT_PUBLIC_API_URL=http://192.168.1.100:8000 > .env.local

# Pe Linux/Mac
echo "NEXT_PUBLIC_API_URL=http://192.168.1.100:8000" > .env.local
```

**Înlocuiește `192.168.1.100` cu IP-ul real al Pi-ului tău!**

### Pasul 4: Repornește Frontend-ul

1. Oprește frontend-ul actual (Ctrl+C în Terminal 3)
2. Pornește-l din nou:
   ```bash
   cd apps/web
   npm run dev
   ```

Frontend-ul va citi noua configurare și se va conecta la Pi.

### Pasul 5: Oprește Backend-ul Local (Opțional)

Dacă vrei să folosești doar Pi-ul:
- Oprește Terminal 1 (backend local) - Ctrl+C
- Păstrează Terminal 2 (mock simulator) DOAR dacă vrei să trimiți date simulate de pe laptop
- Păstrează Terminal 3 (frontend)

---

## Configurări Alternative

### Opțiunea A: Folosește hostname-ul Pi-ului

Dacă Pi-ul tău are mDNS configurat:
```env
NEXT_PUBLIC_API_URL=http://pi-server.local:8000
```

### Opțiunea B: Dezvoltare Locală (implicit)

Dacă nu creezi `.env.local`, frontend-ul va folosi:
```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

---

## Verificare Conexiune

### 1. Testează Backend-ul Pi

De pe laptop, în browser sau terminal:
```bash
# Browser
http://192.168.1.100:8000/health

# Terminal (Windows)
curl http://192.168.1.100:8000/health

# PowerShell
Invoke-WebRequest http://192.168.1.100:8000/health
```

Ar trebui să primești: `{"status":"ok"}`

### 2. Verifică Frontend-ul

Deschide `http://localhost:3000` în browser și verifică:
- Console-ul browser (F12) pentru erori de conexiune
- Dacă datele se actualizează în timp real
- Dacă graficele afișează date

---

## Troubleshooting

### Eroare: "Failed to fetch"

**Cauză**: Frontend-ul nu poate ajunge la Pi.

**Soluții**:
1. Verifică că backend-ul rulează pe Pi: `curl http://PI_IP:8000/health`
2. Verifică firewall-ul pe Pi:
   ```bash
   sudo ufw status
   sudo ufw allow 8000/tcp
   ```
3. Verifică că ambele dispozitive sunt în aceeași rețea

### Eroare: "CORS policy"

**Cauză**: Backend-ul blochează request-uri de la alte origini.

**Soluție**: Backend-ul FastAPI are deja CORS configurat în [`app/main.py`](../pi/app/main.py), dar verifică că include IP-ul laptop-ului.

### Frontend nu se actualizează după schimbarea .env.local

**Soluție**: 
1. Oprește frontend-ul (Ctrl+C)
2. Șterge cache-ul Next.js: `rm -rf .next` (sau `rmdir /s .next` pe Windows)
3. Repornește: `npm run dev`

---

## Arhitectura Finală

```
┌─────────────────┐
│   Laptop        │
│                 │
│  Frontend       │◄─── Browser (localhost:3000)
│  (Next.js)      │
│  Port 3000      │
└────────┬────────┘
         │
         │ HTTP/SSE
         │
         ▼
┌─────────────────┐
│  Raspberry Pi   │
│                 │
│  Backend        │◄─── ESP32 (POST /ingest)
│  (FastAPI)      │
│  Port 8000      │
│                 │
│  SQLite DB      │
└─────────────────┘
```

---

## Quick Start Commands

### Pe Raspberry Pi:
```bash
cd ~/hackathon/apps/pi
bash start-server.sh
```

### Pe Laptop (apps/web):
```bash
# Creează .env.local cu IP-ul Pi-ului
echo NEXT_PUBLIC_API_URL=http://192.168.1.100:8000 > .env.local

# Repornește frontend-ul
npm run dev
```

---

## Note Importante

- ⚠️ **Repornește frontend-ul** după modificarea `.env.local`
- ⚠️ **Verifică IP-ul Pi-ului** - se poate schimba după restart
- ✅ **Backend-ul local** (Terminal 1) nu mai e necesar când folosești Pi-ul
- ✅ **Mock simulator** (Terminal 2) poate rămâne pornit pentru teste
