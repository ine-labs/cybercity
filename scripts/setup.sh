#!/bin/bash
# CyberCity ICS/OT — Quick Setup Script
set -e

# Absolute path to the repo root, independent of where the script is invoked from.
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "============================================"
echo "  CyberCity ICS/OT — Setup"
echo "  ICS/OT Cybersecurity Training Platform"
echo "============================================"
echo ""

# Check prerequisites
echo "[1/5] Checking prerequisites..."

if ! command -v node &> /dev/null; then
    echo "  Node.js not found."
    exit 1
fi
echo "  Node.js: $(node --version)"

if ! command -v python3 &> /dev/null; then
    echo "  Python3 not found."
    exit 1
fi
echo "  Python: $(python3 --version)"

echo ""

# Install frontend dependencies
echo "[2/5] Installing frontend dependencies..."
cd "$ROOT/frontend"
npm install
echo "  Frontend dependencies installed."
echo ""

# Set up Python virtual environment
echo "[3/5] Setting up Python backend..."
cd "$ROOT/backend"
if [ ! -d "venv" ]; then
    if ! python3 -m venv venv; then
        echo "  Failed to create venv. On Debian/Ubuntu/Kali: sudo apt install -y python3-venv"
        exit 1
    fi
fi
source venv/bin/activate
pip install -q -r requirements.txt
echo "  Backend dependencies installed."
echo ""

echo "[4/5] Setup complete!"
echo ""
echo "============================================"
echo "  To start the lab, run these in separate terminals:"
echo ""
echo "  Terminal 1 (Backend):"
echo "    cd backend"
echo "    source venv/bin/activate"
echo "    python main.py"
echo ""
echo "  Terminal 2 (Frontend):"
echo "    cd frontend"
echo "    npm run dev"
echo ""
echo "  Then open: http://localhost:3000"
echo "============================================"
echo ""
echo "[5/5] Services & Ports:"
echo "    Frontend:   http://localhost:3000"
echo "    Backend:    http://localhost:8000"
echo "    Modbus/TCP: localhost:5020  (Scenario 1 — HydraGuard)"
echo "    SNMP/UDP:   localhost:5021  (Scenario 2 — Traffic Controller)"
echo "    IEC 104:    localhost:5022  (Scenario 3 — Copperline Substation)"
echo "    Modbus/TCP: localhost:5023  (Scenario 4 — Redwater Compressor Station)"
echo "    Serial/UDP: localhost:5025  (Scenario 5 — Cedar Creek Lift Station)"
echo "============================================"
