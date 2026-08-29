#!/bin/bash
# CyberCity ICS/OT — Quick Setup Script for macOS
set -e

echo "============================================"
echo "  CyberCity ICS/OT — Setup"
echo "  ICS/OT Cybersecurity Training Platform"
echo "============================================"
echo ""

# Check prerequisites
echo "[1/6] Checking prerequisites..."

if ! command -v node &> /dev/null; then
    echo "  Node.js not found. Install with: brew install node"
    exit 1
fi
echo "  Node.js: $(node --version)"

if ! command -v python3 &> /dev/null; then
    echo "  Python3 not found. Install with: brew install python@3.11"
    exit 1
fi
echo "  Python: $(python3 --version)"

# Check for SNMP tools (needed for Scenario 2)
if command -v snmpwalk &> /dev/null; then
    echo "  SNMP tools: installed"
else
    echo "  SNMP tools: NOT FOUND (needed for Scenario 2)"
    echo "    Install with: brew install net-snmp"
    echo "    Continuing setup anyway..."
fi

echo ""

# Install frontend dependencies
echo "[2/6] Installing frontend dependencies..."
cd "$(dirname "$0")/../frontend"
npm install
echo "  Frontend dependencies installed."
echo ""

# Set up Python virtual environment
echo "[3/6] Setting up Python backend..."
cd "$(dirname "$0")/../backend"
if [ ! -d "venv" ]; then
    python3 -m venv venv
fi
source venv/bin/activate
pip install -q -r requirements.txt
echo "  Backend dependencies installed."
echo ""

echo "[4/6] Setup complete!"
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
echo "[5/6] Or use Docker Compose (from project root):"
echo "    docker-compose up --build"
echo "    Then open: http://localhost:3000"
echo "============================================"
echo ""
echo "[6/6] Services & Ports:"
echo "    Frontend:   http://localhost:3000"
echo "    Backend:    http://localhost:8000"
echo "    Modbus/TCP: localhost:5020  (Scenario 1 — HydraGuard)"
echo "    SNMP/UDP:   localhost:5021  (Scenario 2 — Traffic Controller)"
echo "    IEC 104:    localhost:5022  (Scenario 3 — Copperline Substation)"
echo "    DNP3/TCP:   localhost:5023  (Scenario 4 — Meridian Compressor Station)"
echo "============================================"
