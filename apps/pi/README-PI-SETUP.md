# NeoGuard Raspberry Pi Setup Guide

## Problem Diagnosis

You encountered this error because Raspberry Pi OS uses an **externally-managed Python environment** (PEP 668). This prevents direct `pip install` commands to protect the system Python installation.

### Error Symptoms:
```bash
bash: uvicorn: command not found
error: externally-managed-environment
```

### Root Causes:
1. **No virtual environment** - Python packages must be installed in an isolated venv
2. **Missing python3-venv** - The venv module might not be installed on your Pi

---

## Solution: Use Virtual Environment

### Option 1: Automated Setup (Recommended)

Run the setup script from the `apps/pi` directory:

```bash
cd ~/hackathon/apps/pi
bash setup-pi-env.sh
```

This script will:
- Check Python installation
- Install `python3-venv` if needed
- Create a virtual environment
- Install all dependencies from `requirements.txt`

### Option 2: Manual Setup

If you prefer manual control:

```bash
cd ~/hackathon/apps/pi

# 1. Install venv support (if not already installed)
sudo apt update
sudo apt install -y python3-venv python3-full

# 2. Create virtual environment
python3 -m venv venv

# 3. Activate virtual environment
source venv/bin/activate

# 4. Upgrade pip
pip install --upgrade pip

# 5. Install dependencies
pip install -r requirements.txt
```

---

## Running the Server

### Using the Start Script (Recommended)

```bash
cd ~/hackathon/apps/pi
bash start-server.sh
```

### Manual Start

```bash
cd ~/hackathon/apps/pi
source venv/bin/activate
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

---

## Diagnostics

If you encounter issues, run the diagnostic script:

```bash
cd ~/hackathon/apps/pi
bash diagnose-pi.sh
```

This will check:
- Python version and location
- pip3 availability
- python3-venv installation status
- Virtual environment existence
- uvicorn installation
- requirements.txt presence

---

## Quick Reference

### Activate Virtual Environment
```bash
source venv/bin/activate
```

### Deactivate Virtual Environment
```bash
deactivate
```

### Reinstall Dependencies
```bash
source venv/bin/activate
pip install -r requirements.txt --force-reinstall
```

### Check Server Status
```bash
# From another terminal or machine
curl http://YOUR_PI_IP:8000/health
```

---

## Troubleshooting

### Issue: "python3-venv not found"
**Solution:**
```bash
sudo apt update
sudo apt install python3-venv python3-full
```

### Issue: "Permission denied" when running scripts
**Solution:**
```bash
chmod +x setup-pi-env.sh start-server.sh diagnose-pi.sh
```

### Issue: Port 8000 already in use
**Solution:**
```bash
# Find process using port 8000
sudo lsof -i :8000

# Kill the process (replace PID with actual process ID)
kill -9 PID

# Or use a different port
uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload
```

### Issue: "Module not found" errors
**Solution:**
```bash
source venv/bin/activate
pip install -r requirements.txt --force-reinstall
```

---

## Architecture Notes

- **Backend API**: FastAPI running on port 8000
- **Database**: SQLite (`data/neotwin.db`)
- **Data Ingestion**: POST `/ingest` endpoint receives sensor data
- **SSE Stream**: GET `/stream` provides real-time updates to frontend
- **Rules Engine**: Evaluates clinical rules from `data/clinical-rules.json`

---

## Next Steps

1. ✅ Set up virtual environment
2. ✅ Install dependencies
3. ✅ Start the FastAPI server
4. 🔄 Configure ESP32 to send data to Pi's IP address
5. 🔄 Update frontend to connect to Pi's IP address

---

## Support

If you continue to have issues, run the diagnostic script and share the output:
```bash
bash diagnose-pi.sh > diagnostic-output.txt
cat diagnostic-output.txt
```
