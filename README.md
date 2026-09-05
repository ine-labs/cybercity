## CyberCity - ICS/OT Cybersecurity Training Platform

<p align="center">
  <img src="assets/logo.png" alt="CyberCity ICS/OT Logo" width="1050">
</p>

<p align="center">
  <img alt="Node.js" src="https://img.shields.io/badge/Node.js-20+-339933?logo=nodedotjs&logoColor=white" />
  <img alt="Python" src="https://img.shields.io/badge/Python-3.11+-3776AB?logo=python&logoColor=white" />
  <img alt="React" src="https://img.shields.io/badge/React-Konva%20%2B%20Recharts-61DAFB?logo=react&logoColor=black" />
  <img alt="FastAPI" src="https://img.shields.io/badge/FastAPI-WebSocket-009688?logo=fastapi&logoColor=white" />
  <img alt="Docker" src="https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white" />
</p>

<p align="center">
  <img alt="Modbus" src="https://img.shields.io/badge/Protocol-Modbus%2FTCP-FF6B35" />
  <img alt="SNMP" src="https://img.shields.io/badge/Protocol-SNMP%20v2c%20%28NTCIP%29-8B5CF6" />
  <img alt="IEC 60870-5-104" src="https://img.shields.io/badge/Protocol-IEC%2060870--5--104-0EA5E9" />
  <img alt="Modbus/TCP (Pipeline)" src="https://img.shields.io/badge/Protocol-Modbus%2FTCP%20%28Pipeline%29-FB923C" />
</p>

<p align="center">
  <img alt="License" src="https://img.shields.io/badge/License-Educational%20Use-F59E0B" />
  <img alt="Status" src="https://img.shields.io/badge/Status-Active%20Development-blue" />
  <a href="https://www.blackhat-india.com/arsenal-schedule#cybercity---icsot-cybersecurity-training-platform-60014" target="_blank" rel="noopener noreferrer"><img alt="Black Hat Arsenal" src="https://img.shields.io/badge/Black%20Hat-Arsenal%20India%202026-8B5CF6" /></a>
</p>

<p align="center"><strong>Industrial Control Systems / Operational Technology (ICS/OT) Cybersecurity Training Platform.</strong></p>

<p align="center">📖 <strong><a href="https://ine-labs.github.io/cybercity/" target="_blank" rel="noopener noreferrer">Documentation</a></strong></p>

---

A scenario-based training lab where students learn to assess and exploit real-world industrial control systems. Each scenario simulates a different critical infrastructure facility with live physics, real ICS/OT protocols, and visual feedback.

<p align="center">🏆 <strong>Featuring at <a href="https://www.blackhat-india.com/arsenal-schedule#cybercity---icsot-cybersecurity-training-platform-60014" target="_blank" rel="noopener noreferrer">Black Hat India 2026 Arsenal</a></strong></p>

## 🎬 Demo

![CyberCity ICS/OT Demo](assets/demo.gif)

## 👥 Contributors

- Ashish Bhangale, Lead Security Researcher (R&D), [LinkedIn](https://www.linkedin.com/in/hax0rguy/)
- G Khartheesvar, Sr. Engineer (R&D), [LinkedIn](https://www.linkedin.com/in/g-khartheesvar/)
- Litesh Ghute, Sr. Engineer (R&D), [LinkedIn](https://www.linkedin.com/in/liteshghute/)

## 🎯 Scenarios

| # | Facility | Protocol | Port | Status |
|---|----------|----------|------|--------|
| 1 | **HydraGuard**: Dam & Water Treatment Plant | **Modbus/TCP** | 5020 | ✅ Active |
| 2 | **MetroGrid**: 4-Way Traffic Intersection | **SNMP v2c** (NTCIP) | 5021/udp | ✅ Active |
| 3 | **Copperline Substation**: 230/115kV Power Grid | **IEC 60870-5-104** | 5022 | ✅ Active |
| 4 | **Redwater Compressor Station**: Gas Pipeline | **Modbus/TCP** | 5023 | ✅ Active |
| 5 | **Cedar Creek Lift Station 7**: Wastewater Pumping Station | **Serial Gateway (UDP)** | 5025/udp | ✅ Active |
| 6+ | **More scenarios in development** | - | - | 🔜 Coming Soon |

---

### 🌊 Scenario 1: HydraGuard (Dam & Water Treatment)
**Modbus/TCP · Port 5020**: zero built-in authentication (inspired by the Bowman Avenue Dam breach and the Oldsmar, FL water treatment incident).

- Enumerate and manipulate registers with `mbpoll`/`modpoll`, sniff cleartext traffic with Wireshark
- Open sluice gates, spike chemical dosing, kill pumps, disable alarms

---

### 🚦 Scenario 2: MetroGrid (4-Way Traffic Intersection)
**SNMP v2c (NTCIP 1202) · Port 5021/UDP**: plaintext community-string auth; real intersections have been found exposed with default strings.

- Walk the OID tree with `snmpwalk`, rewrite phase timing and signal state
- Abuse Emergency Vehicle Preemption and disable the Conflict Monitor to force simultaneous greens (TRISIS-style safety bypass)

---

### ⚡ Scenario 3: Copperline Substation (230/115kV Power Grid)
**IEC 60870-5-104 · Port 5022**: no default authentication (mirrors the Industroyer/Crashoverride attack, Ukraine 2016).

- Read breaker, transformer, and relay state; trip circuit breakers; disable protection relays
- Cascade a transformer overload into a full 190MW blackout

---

### ⛽ Scenario 4: Redwater Compressor Station (Gas Pipeline)
**Modbus/TCP · Port 5023**: zero built-in authentication (mirrors PIPEDREAM/INCONTROLLER and TRISIS/TRITON).

- Enumerate coils and registers with `mbpoll`, bypass the electronic ESD *and* isolate the mechanical relief valve to defeat both safety layers
- Spoof telemetry so the operator's HMI stays "nominal" while the pipeline ruptures underneath (Stuxnet-style deception)

---

### 💧 Scenario 5: Cedar Creek Lift Station 7 (Wastewater Pumping Station)
**Serial-to-Ethernet Gateway (UDP) · Port 5025**: unauthenticated, unthrottled legacy gateway (mirrors the Maroochy Shire sewage-SCADA attack, 2000).

- Flood the gateway; the goal is pure denial of control
- Starve the station's comms until the pump loses control and the wet well overflows, while the operator's HMI freezes on stale, pre-attack data

## 🚀 Quick Start

#### 📋 Prerequisites

- **Node.js** 20+ (`brew install node`)
- **Python** 3.11+ (`brew install python@3.11`)
- **SNMP tools** for Scenario 2 (`brew install net-snmp`)

#### ⚙️ Setup & Run

**Step 1: Clone the repository**

```bash
git clone https://github.com/ine-labs/cybercity.git
cd cybercity
```

**Step 2: Setup**

```bash
chmod +x scripts/setup.sh
./scripts/setup.sh
```

**Step 3: Run (two terminals)**

**Terminal 1 (Backend):**

```bash
cd backend
source venv/bin/activate
python main.py
```

**Terminal 2 (Frontend):**

```bash
cd frontend
npm run dev
```

**Step 4: Open the app**

Open [http://localhost:3000](http://localhost:3000) in your browser.

## 🐳 Run with Docker (alternative)

```bash
git clone https://github.com/ine-labs/cybercity.git
cd cybercity
docker compose up --build
```

Open [http://localhost:3000](http://localhost:3000).

## 🏛️ Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Browser (localhost:3000)                               │
│  React + Konva.js + Recharts                            │
└────────────────────────┬────────────────────────────────┘
                         │ WebSocket (Socket.IO)
                         ▼
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│  FastAPI + Socket.IO (localhost:8000)                                                        │
│  Physics Engine · Protocol Servers · Real-time State                                         │
├──────────────────┬──────────────────┬──────────────────┬──────────────────┬──────────────────┤
│ Modbus/TCP       │ SNMP Agent       │ IEC 60870-5-104  │ Modbus/TCP       │ Serial Gateway   │
│ Port 5020        │ Port 5021/udp    │ Port 5022        │ Port 5023        │ Port 5025/udp    │
│ Dam & Treatment  │ Traffic Control  │ Power Substation │ Gas Pipeline     │ Lift Station     │
└──────────────────┴──────────────────┴──────────────────┴──────────────────┴──────────────────┘
        ▲                  ▲                  ▲                  ▲                  ▲
        │                  │                  │                  │                  │
   mbpoll/modpoll    snmpwalk/snmpset    nmap/Metasploit     mbpoll/Metasploit  hping3/nping
   (Student attacks with standard ICS/OT tooling)
```

---

*This project is under active development. New scenarios and features are being added regularly.*

## 📄 License

This program is free software: you can redistribute it and/or modify it under the terms of the MIT License.
