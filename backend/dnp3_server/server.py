"""
DNP3 Outstation Server — Meridian Compressor Station 7

INTENTIONALLY VULNERABLE:
- No DNP3 Secure Authentication (SAv5 exists in the standard but is almost
  never deployed in the field)
- No encryption, no source validation — any TCP client can issue Direct
  Operate commands
- This mirrors real-world gas/electric utility DNP3 outstation deployments
  repeatedly flagged in DHS/CISA ICS advisories

Protocol: Newline-delimited JSON over TCP (port 5023)
  (Simplified DNP3 application layer — preserves DNP3 group/variation/index
  addressing and function-code semantics without full frame-layer encoding)

Commands (master -> outstation, each terminated with \\n):
  {"cmd": "identify"}
  {"cmd": "read_class0"}
  {"cmd": "read_point",  "group": 30, "index": 1}
  {"cmd": "operate",     "group": 12, "index": 0, "value": false}
  {"cmd": "operate",     "group": 40, "index": 0, "value": 13000}
"""

import asyncio
import json
import logging
import time
from typing import Optional

from dnp3_server.points import (
    ANALOG_INPUTS, BINARY_INPUTS, BINARY_OUTPUTS, ANALOG_OUTPUTS, GROUP_TABLE_NAME,
)

log = logging.getLogger("dnp3_server")


class DNP3OutstationServer:
    OUTSTATION_NAME = "MERIDIAN-CS7-RTU1"
    SERVER_INFO     = "DNP3 Outstation - Meridian Compressor Station 7"

    def __init__(self, host: str = "0.0.0.0", port: int = 5023):
        self.host = host
        self.port = port

        self._values: dict = {}
        self._pending_writes: dict = {}

        self._server: Optional[asyncio.AbstractServer] = None
        self._client_count = 0

        self._init_defaults()

    def _init_defaults(self):
        for idx in ANALOG_INPUTS:
            self._values[("AI", idx)] = 0.0
        for idx in BINARY_INPUTS:
            self._values[("BI", idx)] = False
        for idx, meta in BINARY_OUTPUTS.items():
            self._values[("BO", idx)] = meta["name"] == "esd_armed"
        for idx in ANALOG_OUTPUTS:
            self._values[("AO", idx)] = 9500.0

    def reset(self):
        self._pending_writes.clear()
        self._init_defaults()
        log.info("DNP3 outstation: point values reset to defaults")

    # ── Simulation sync ───────────────────────────────────────────────────
    def update_from_simulation(self, pipeline_state: dict):
        s = pipeline_state
        for idx, meta in ANALOG_INPUTS.items():
            self._values[("AI", idx)] = s.get(meta["name"], 0.0)
        for idx, meta in BINARY_INPUTS.items():
            self._values[("BI", idx)] = bool(s.get(meta["name"], False))

        self._values[("BO", 0)] = s.get("esd_armed", True)
        self._values[("BO", 1)] = s.get("prv_block_valve_closed", False)
        self._values[("BO", 2)] = s.get("suction_valve_open", True)
        self._values[("BO", 3)] = s.get("discharge_valve_open", True)
        self._values[("BO", 4)] = s.get("blowdown_valve_open", False)
        self._values[("BO", 5)] = s.get("telemetry_spoofed", False)
        self._values[("AO", 0)] = s.get("rpm_setpoint", 9500.0)

    def read_attacker_writes(self) -> dict:
        """Consume and return pending Direct Operate writes."""
        writes = dict(self._pending_writes)
        self._pending_writes.clear()
        return writes

    # ── DNP3 command dispatch ─────────────────────────────────────────────
    def _point_ref(self, group, index) -> str:
        table = GROUP_TABLE_NAME.get(group, "?")
        return f"G{group}V{index} ({table})"

    def _dispatch(self, msg: dict) -> dict:
        cmd = str(msg.get("cmd", "")).lower()
        ts  = round(time.time(), 3)

        if cmd == "identify":
            return {
                "status": "ok",
                "outstation": self.OUTSTATION_NAME,
                "server": self.SERVER_INFO,
                "protocol": "DNP3",
                "link_layer": "TCP",
                "auth": "NONE",
                "secure_authentication": "NOT CONFIGURED",
                "location": "Meridian Pipeline -- Compressor Station 7",
                "timestamp": ts,
            }

        elif cmd == "read_class0":
            # Integrity poll — full static data read (what a real DNP3 master
            # does immediately after establishing a link with an outstation)
            ai = {f"G30V{i}": {"value": self._values[("AI", i)], **m} for i, m in ANALOG_INPUTS.items()}
            bi = {f"G1V{i}":  {"value": self._values[("BI", i)], **m} for i, m in BINARY_INPUTS.items()}
            bo = {f"G12V{i}": {"value": self._values[("BO", i)], **m} for i, m in BINARY_OUTPUTS.items()}
            ao = {f"G40V{i}": {"value": self._values[("AO", i)], **m} for i, m in ANALOG_OUTPUTS.items()}
            return {
                "status": "ok",
                "function_code": "READ (Class 0 integrity poll)",
                "analog_inputs": ai,
                "binary_inputs": bi,
                "binary_outputs": bo,
                "analog_outputs": ao,
                "count": len(ai) + len(bi) + len(bo) + len(ao),
                "t": ts,
            }

        elif cmd == "read_point":
            group, index = msg.get("group"), msg.get("index")
            registries = {1: BINARY_INPUTS, 30: ANALOG_INPUTS, 12: BINARY_OUTPUTS, 40: ANALOG_OUTPUTS}
            registry = registries.get(group)
            if registry is None or index not in registry:
                return {"status": "error", "message": f"Unknown point {self._point_ref(group, index)}"}
            key  = GROUP_TABLE_NAME[group]
            meta = registry[index]
            return {
                "status": "ok",
                "ref":   f"G{group}V{index}",
                "name":  meta["name"],
                "value": self._values[(key, index)],
                "desc":  meta["desc"],
                "unit":  meta.get("unit", ""),
                "t":     ts,
            }

        elif cmd == "operate":
            group, index, value = msg.get("group"), msg.get("index"), msg.get("value")

            if group == 12:
                registry, key = BINARY_OUTPUTS, "BO"
                value = bool(value)
            elif group == 40:
                registry, key = ANALOG_OUTPUTS, "AO"
                try:
                    value = float(value)
                except (TypeError, ValueError):
                    return {"status": "error", "message": "Analog Output value must be numeric"}
            else:
                return {"status": "error", "message": f"Group {group} is not operable (read-only)"}

            if index not in registry:
                return {"status": "error", "message": f"Unknown point {self._point_ref(group, index)}"}

            meta = registry[index]
            self._values[(key, index)] = value
            self._pending_writes[meta["name"]] = value

            action = self._describe_operate(meta["name"], value)
            log.warning(f"[DNP3] DIRECT OPERATE G{group}V{index} ({meta['name']}) = {value}  ({action})")

            return {
                "status":        "ok",
                "function_code": "DIRECT_OPERATE",
                "ref":            f"G{group}V{index}",
                "name":           meta["name"],
                "value":          value,
                "action":         action,
                "t":              ts,
            }

        else:
            return {
                "status": "error",
                "message": f"Unknown command '{cmd}'. Supported: identify, read_class0, read_point, operate",
            }

    def _describe_operate(self, name: str, value) -> str:
        if name == "esd_armed":
            return "ARM Emergency Shutdown System" if value else \
                   "BYPASS ESD/SIS -- DANGER: no automatic protective trip"
        if name == "prv_block_valve_closed":
            return "CLOSE PRV isolation -- mechanical relief valve BLOCKED" if value else \
                   "OPEN PRV isolation -- relief valve active"
        if name == "suction_valve_open":
            return "OPEN suction block valve" if value else "CLOSE suction block valve"
        if name == "discharge_valve_open":
            return "OPEN discharge block valve" if value else \
                   "CLOSE discharge block valve -- risk of deadhead"
        if name == "blowdown_valve_open":
            return "OPEN blowdown/vent valve" if value else "CLOSE blowdown/vent valve"
        if name == "telemetry_spoofed":
            return "ACTIVATE telemetry spoofing -- HMI will show false nominal readings" if value else \
                   "DEACTIVATE telemetry spoofing"
        if name == "rpm_setpoint":
            return f"SET compressor speed setpoint to {value:.0f} RPM"
        return "configuration change"

    # ── TCP connection handler ────────────────────────────────────────────
    async def _handle_client(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter):
        addr = writer.get_extra_info("peername")
        self._client_count += 1
        log.info(f"[DNP3] Master connected from {addr}  (total: {self._client_count})")

        banner = {
            "type": "banner",
            "outstation": self.OUTSTATION_NAME,
            "server": self.SERVER_INFO,
            "protocol": "DNP3",
            "auth": "NONE",
            "note": "No Secure Authentication configured -- legacy field deployment",
        }
        writer.write((json.dumps(banner) + "\n").encode())
        await writer.drain()

        try:
            while True:
                raw = await reader.readline()
                if not raw:
                    break
                raw = raw.strip()
                if not raw:
                    continue

                try:
                    msg = json.loads(raw.decode())
                except json.JSONDecodeError as e:
                    resp = {"status": "error", "message": f"JSON parse error: {e}"}
                    writer.write((json.dumps(resp) + "\n").encode())
                    await writer.drain()
                    continue

                resp = self._dispatch(msg)
                writer.write((json.dumps(resp) + "\n").encode())
                await writer.drain()

        except (asyncio.IncompleteReadError, ConnectionResetError):
            pass
        finally:
            self._client_count -= 1
            log.info(f"[DNP3] Master {addr} disconnected")
            writer.close()

    # ── Server startup ────────────────────────────────────────────────────
    async def start(self):
        self._server = await asyncio.start_server(self._handle_client, self.host, self.port)
        log.info(f"[DNP3] Outstation listening on TCP {self.host}:{self.port}")
        log.info(f"[DNP3]   Outstation: {self.OUTSTATION_NAME} | Auth: NONE (intentionally vulnerable)")
        log.info(f"[DNP3]   Points: {len(ANALOG_INPUTS)} AI, {len(BINARY_INPUTS)} BI, "
                 f"{len(BINARY_OUTPUTS)} BO, {len(ANALOG_OUTPUTS)} AO")

        async with self._server:
            await self._server.serve_forever()
