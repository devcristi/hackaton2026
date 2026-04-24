#!/bin/bash
# NeoGuard Pi Environment Setup Script
# This script sets up a Python virtual environment on Raspberry Pi

echo "=== NeoGuard Pi Environment Setup ==="
echo ""

# Check if we're in the right directory
if [ ! -f "requirements.txt" ]; then
    echo "ERROR: requirements.txt not found. Please run this script from apps/pi directory"
    exit 1
fi

# Check Python version
echo "1. Checking Python installation..."
python3 --version
if [ $? -ne 0 ]; then
    echo "ERROR: Python3 not found"
    exit 1
fi

# Check if python3-venv is installed
echo ""
echo "2. Checking if python3-venv is available..."
python3 -m venv --help > /dev/null 2>&1
if [ $? -ne 0 ]; then
    echo "WARNING: python3-venv not found. Installing..."
    sudo apt update
    sudo apt install -y python3-venv python3-full
fi

# Create virtual environment
echo ""
echo "3. Creating virtual environment..."
if [ -d "venv" ]; then
    echo "Virtual environment already exists. Removing old one..."
    rm -rf venv
fi

python3 -m venv venv
if [ $? -ne 0 ]; then
    echo "ERROR: Failed to create virtual environment"
    exit 1
fi

echo "Virtual environment created successfully!"

# Activate and install dependencies
echo ""
echo "4. Installing dependencies..."
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt

if [ $? -eq 0 ]; then
    echo ""
    echo "=== Setup Complete! ==="
    echo ""
    echo "To activate the environment, run:"
    echo "  source venv/bin/activate"
    echo ""
    echo "To start the server, run:"
    echo "  source venv/bin/activate"
    echo "  uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload"
    echo ""
else
    echo "ERROR: Failed to install dependencies"
    exit 1
fi
