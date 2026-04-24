#!/bin/bash
# Diagnostic script to check Pi environment

echo "=== NeoGuard Pi Environment Diagnostics ==="
echo ""

echo "1. Python Version:"
python3 --version
echo ""

echo "2. Python3 Location:"
which python3
echo ""

echo "3. Pip3 Version:"
pip3 --version
echo ""

echo "4. Check if python3-venv is available:"
python3 -m venv --help > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo "✓ python3-venv is available"
else
    echo "✗ python3-venv is NOT available"
    echo "  Install with: sudo apt install python3-venv python3-full"
fi
echo ""

echo "5. Check if virtual environment exists:"
if [ -d "venv" ]; then
    echo "✓ Virtual environment exists at ./venv"
    echo ""
    echo "6. Check if uvicorn is installed in venv:"
    if [ -f "venv/bin/uvicorn" ]; then
        echo "✓ uvicorn is installed in venv"
    else
        echo "✗ uvicorn is NOT installed in venv"
    fi
else
    echo "✗ Virtual environment does NOT exist"
    echo "  Create with: python3 -m venv venv"
fi
echo ""

echo "7. Current directory:"
pwd
echo ""

echo "8. Check requirements.txt:"
if [ -f "requirements.txt" ]; then
    echo "✓ requirements.txt found"
    echo "  Contents:"
    cat requirements.txt
else
    echo "✗ requirements.txt NOT found"
fi
echo ""

echo "=== Diagnostics Complete ==="
