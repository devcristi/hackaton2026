# Quick Start pentru Raspberry Pi

## Situația Ta Actuală

Văd că ai deja:
- ✅ Conectat prin SSH la Pi (172.20.10.12)
- ✅ Virtual environment creat (`venv` folder există)
- ✅ Structura de foldere corectă (`pi/app`, `pi/data`, `pi/venv`)

## Comenzi de Rulat pe Pi (prin SSH)

### Varianta 1: Pas cu Pas

```bash
# 1. Navighează în directorul pi
cd ~/hackathon/pi

# 2. Activează virtual environment
source venv/bin/activate

# 3. Verifică dacă uvicorn e instalat
which uvicorn

# 4. Dacă uvicorn lipsește, instalează dependențele
pip install -r requirements.txt

# 5. Pornește serverul
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### Varianta 2: O Singură Comandă

```bash
cd ~/hackathon/pi && source venv/bin/activate && uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

---

## Dacă Virtual Environment-ul Are Probleme

Dacă primești erori legate de pachete lipsă:

```bash
cd ~/hackathon/pi
rm -rf venv
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

---

## Verificare Rapidă

După ce pornești serverul, testează din browser sau alt terminal:

```bash
# Află IP-ul Pi-ului
hostname -I

# Testează endpoint-ul de health
curl http://localhost:8000/health
```

Ar trebui să primești: `{"status":"ok"}`

---

## Notă Importantă

⚠️ **Scripturile `.sh` nu funcționează direct** pentru că trebuie să fie executabile și să fie în formatul corect pentru Linux. Folosește comenzile de mai sus direct în terminal SSH.

---

## După ce Backend-ul Rulează pe Pi

Pe laptop, în `apps/web/.env.local`:
```env
NEXT_PUBLIC_API_URL=http://172.20.10.12:8000
```

Apoi repornește frontend-ul pe laptop.
