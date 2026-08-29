# CyberCity — Docker Deployment (Kali lab)

A self-contained Docker setup. The images bake in all code and Node/Python
dependencies, use **host networking** (Linux), and hold **no persistent state** —
so relaunching always returns to a clean simulation.

## Ports (keep these free on the Kali host)

| Port | Service |
|------|---------|
| 3000 | Frontend (HMI) — open `http://localhost:3000` |
| 8000 | Backend API + WebSocket |
| 5020/tcp | Modbus — HydraGuard |
| 5021/udp | SNMP — MetroGrid |
| 5022/tcp | IEC 61850 — Northgate |
| 5023/tcp | DNP3 — Meridian |

Check for conflicts before launch: `sudo ss -tulpn | grep -E ':(3000|8000|502[0-3])'`

## Prerequisites

- Docker Engine + Docker Compose plugin on the host.
- **Linux host** (Kali). `network_mode: host` is Linux-only; it will not expose
  ports correctly on macOS/Windows Docker Desktop.
- Attacker tools run from the **Kali host** (not the container): `nmap`,
  Wireshark, Metasploit ship with Kali; add the rest with
  `sudo apt install snmp mbpoll` (net-snmp + mbpoll).

---

## Option A — Build and run on Kali (needs internet during setup)

```bash
git clone <repo> && cd cybercity
docker compose up -d --build        # first run pulls base images + deps, builds
```
Open `http://localhost:3000`. Subsequent runs work offline (`docker compose up -d`).

## Option C — Offline / air-gapped (build elsewhere, load on Kali)

On an internet-connected **Linux machine of the same CPU architecture as Kali**
(see note below):
```bash
docker compose build
docker save cybercity-backend cybercity-frontend -o cybercity-images.tar
# copy cybercity-images.tar + docker-compose.yml + DEPLOY.md to Kali (USB)
```
On the air-gapped Kali:
```bash
docker load -i cybercity-images.tar
docker compose up -d                # uses loaded images; no build, no internet
```

> **Architecture matters.** Docker images are CPU-arch specific. If Kali is
> x86_64, build the tarball on an x86_64 Linux box, or cross-build with
> `docker buildx build --platform linux/amd64 ...`. Building **on Kali itself**
> (Option A) sidesteps this entirely.

---

## Everyday operation (reusable / reset)

```bash
docker compose up -d          # start (detached)
docker compose logs -f        # watch logs
docker compose restart        # restart both -> fresh simulation state
docker compose down           # stop and remove containers
docker compose down && docker compose up -d   # full clean relaunch
```

Because there are **no volumes**, every restart/relaunch resets the simulation to
its safe defaults — nothing to clean up if a session gets messed up. (You can also
hit **RESET SYSTEM** in any Lab Monitor, or `curl -X POST http://localhost:8000/api/reset`,
without restarting.)

## Verify it's up

```bash
curl -s http://localhost:8000/api/status | head -c 200   # backend live
# then browse to http://localhost:3000 and attack localhost:5020-5023
```