"""
IEC 60870-5-104 Outstation Server — Copperline Substation IED

INTENTIONALLY VULNERABLE:
- No authentication, no encryption, no access control
- This mirrors real-world legacy IEC 104 deployments where the RTU/gateway
  is reachable directly from the corporate network or the internet

Protocol: real IEC 60870-5-104 wire format (APCI + ASDU), same framing a
genuine RTU speaks — verified byte-for-byte against nmap's iec-identify.nse
and the wire format used by Metasploit's auxiliary/client/iec104/iec104
module, so standard ICS security tooling (nmap, Metasploit) works against
this server directly; no custom client required.

APCI: 0x68, length, then 4 control-field bytes (I/S/U format)
ASDU:  TypeID(1) VSQ(1) COT(1) Originator(1) CA(2 LE) [IOA(3 LE) + data]*
"""

import asyncio
import logging
import struct
from typing import Optional

from iec104_server.points import (
    CA, DOUBLE_POINTS, DOUBLE_COMMANDS, SINGLE_POINTS, SINGLE_COMMANDS,
    MEASUREMENTS, CB_IOA,
)

log = logging.getLogger("iec104_server")

# ── APCI U-format control bytes ─────────────────────────────────────────────
STARTDT_ACT, STARTDT_CON = 0x07, 0x0B
STOPDT_ACT,  STOPDT_CON  = 0x13, 0x23
TESTFR_ACT,  TESTFR_CON  = 0x43, 0x83

# ── ASDU Type IDs ────────────────────────────────────────────────────────────
M_SP_NA_1 = 1     # Single-point information
M_DP_NA_1 = 3     # Double-point information (breaker: two aux contacts)
M_ME_NC_1 = 13    # Measured value, short floating point
C_SC_NA_1 = 45    # Single command
C_DC_NA_1 = 46    # Double command (breaker control)
C_IC_NA_1 = 100   # General (station) interrogation

# ── Causes of transmission ───────────────────────────────────────────────────
COT_SPONT   = 3
COT_ACT     = 6
COT_ACTCON  = 7
COT_ACTTERM = 10
COT_INROGEN = 20


def _u_frame(control_byte: int) -> bytes:
    return bytes([0x68, 0x04, control_byte, 0x00, 0x00, 0x00])


def _i_header(tx: int, rx: int) -> bytes:
    return bytes([
        (tx << 1) & 0xFF, (tx >> 7) & 0xFF,
        (rx << 1) & 0xFF, (rx >> 7) & 0xFF,
    ])


def _asdu_header(type_id: int, numix: int, cot: int, ca: int = CA, sq: bool = False) -> bytes:
    vsq = (numix & 0x7F) | (0x80 if sq else 0)
    return bytes([type_id, vsq, cot & 0x3F, 0x00]) + struct.pack("<H", ca)


def _ioa(ioa: int) -> bytes:
    return struct.pack("<I", ioa)[:3]


class IEC104OutstationServer:
    HOST = "0.0.0.0"
    PORT = 5022
    STATION_NAME = "COPPERLINE-IED1"

    def __init__(self, host: str = "0.0.0.0", port: int = 5022):
        self.host = host
        self.port = port
        self._values: dict = {}
        self._pending_writes: dict = {}
        self._connections: list = []
        self._server: Optional[asyncio.AbstractServer] = None
        self._init_defaults()

    def _init_defaults(self):
        for _ioa_num, (name, _desc) in DOUBLE_POINTS.items():
            self._values[name] = True   # breakers default closed
        for _ioa_num, (name, _desc) in SINGLE_POINTS.items():
            self._values[name] = False if name == "BLACKOUT" else True   # relays default enabled
        for _ioa_num, (name, _desc, _unit) in MEASUREMENTS.items():
            self._values[name] = 0.0

    def reset(self):
        self._pending_writes.clear()
        self._init_defaults()

    # ── Simulation sync ───────────────────────────────────────────────────
    def update_from_simulation(self, grid_state: dict):
        s = grid_state
        cb = s.get("cb_states", [True] * 7)
        new_values = dict(self._values)

        for ioa_num, idx in CB_IOA.items():
            name = DOUBLE_POINTS[ioa_num][0]
            new_values[name] = bool(cb[idx]) if idx < len(cb) else True
        new_values["PROT1"]    = bool(s.get("protection_enabled", True))
        new_values["DFPT1"]    = bool(s.get("diff_prot_enabled", True))
        new_values["OCPT1"]    = bool(s.get("overcurrent_enabled", True))
        new_values["UFPT1"]    = bool(s.get("underfreq_enabled", True))
        new_values["RREC1"]    = bool(s.get("autorecloser_enabled", True))
        new_values["BLACKOUT"] = bool(s.get("blackout", False))

        new_values["FREQUENCY"]      = float(s.get("frequency", 60.0))
        new_values["HV_VOLTAGE"]     = float(s.get("hv_voltage", 230.0))
        new_values["LV_VOLTAGE"]     = float(s.get("lv_voltage", 115.0))
        new_values["ACTIVE_POWER"]   = float(s.get("active_power", 0.0))
        new_values["REACTIVE_POWER"] = float(s.get("reactive_power", 0.0))
        new_values["POWER_FACTOR"]   = float(s.get("power_factor", 0.0))
        new_values["TX1_LOAD"]       = float(s.get("tx1_load_pct", 0.0))
        new_values["TX2_LOAD"]       = float(s.get("tx2_load_pct", 0.0))
        new_values["TX1_TEMP"]       = float(s.get("tx1_temp", 0.0))
        new_values["TX2_TEMP"]       = float(s.get("tx2_temp", 0.0))
        new_values["GRID_STRESS"]    = float(s.get("grid_stress", 0.0))

        # Spontaneous updates for anything that actually changed
        changed_dp = [ioa_num for ioa_num, (name, _d) in DOUBLE_POINTS.items()
                      if new_values.get(name) != self._values.get(name)]
        changed_sp = [ioa_num for ioa_num, (name, _d) in SINGLE_POINTS.items()
                      if new_values.get(name) != self._values.get(name)]
        changed_me = [ioa_num for ioa_num, (name, _d, _u) in MEASUREMENTS.items()
                      if abs(new_values.get(name, 0.0) - self._values.get(name, 0.0)) > 0.05]

        self._values = new_values

        if changed_dp:
            dp_items = [(ioa_num, self._values[DOUBLE_POINTS[ioa_num][0]]) for ioa_num in changed_dp]
            self._broadcast(self._build_dp_asdu(dp_items, COT_SPONT))
        if changed_sp:
            sp_items = [(ioa_num, self._values[SINGLE_POINTS[ioa_num][0]]) for ioa_num in changed_sp]
            self._broadcast(self._build_sp_asdu(sp_items, COT_SPONT))
        if changed_me:
            me_items = [(ioa_num, self._values[MEASUREMENTS[ioa_num][0]]) for ioa_num in changed_me]
            self._broadcast(self._build_me_asdu(me_items, COT_SPONT))

    def read_attacker_writes(self) -> dict:
        writes = dict(self._pending_writes)
        self._pending_writes.clear()
        return writes

    # ── ASDU builders ──────────────────────────────────────────────────────
    def _build_sp_asdu(self, items, cot):
        body = b"".join(_ioa(ioa_num) + bytes([0x01 if val else 0x00]) for ioa_num, val in items)
        return _asdu_header(M_SP_NA_1, len(items), cot) + body

    def _build_dp_asdu(self, items, cot):
        # DPI: 1=OFF (open), 2=ON (closed)
        body = b"".join(_ioa(ioa_num) + bytes([0x02 if val else 0x01]) for ioa_num, val in items)
        return _asdu_header(M_DP_NA_1, len(items), cot) + body

    def _build_me_asdu(self, items, cot):
        body = b"".join(_ioa(ioa_num) + struct.pack("<f", val) + b"\x00" for ioa_num, val in items)
        return _asdu_header(M_ME_NC_1, len(items), cot) + body

    def _broadcast(self, asdu: bytes):
        for conn in list(self._connections):
            conn.send_i_frame(asdu)

    # ── TCP server ─────────────────────────────────────────────────────────
    async def _handle_client(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter):
        conn = _Connection(self, reader, writer)
        await conn.run()

    async def start(self):
        self._server = await asyncio.start_server(self._handle_client, self.host, self.port)
        log.info(f"[IEC104] Outstation listening on TCP {self.host}:{self.port}")
        log.info(f"[IEC104]   Station: {self.STATION_NAME} | CA={CA} | Auth: NONE (intentionally vulnerable)")
        log.info(f"[IEC104]   Points: {len(DOUBLE_POINTS)} double-point (+{len(DOUBLE_COMMANDS)} commands), "
                  f"{len(SINGLE_POINTS)} single-point (+{len(SINGLE_COMMANDS)} commands), "
                  f"{len(MEASUREMENTS)} measurements")
        async with self._server:
            await self._server.serve_forever()


class _Connection:
    """Per-master connection state: independent I-frame send/receive sequence counters."""

    def __init__(self, server: IEC104OutstationServer, reader, writer):
        self.server = server
        self.reader = reader
        self.writer = writer
        self.send_seq = 0
        self.recv_seq = 0
        self.data_transfer_active = False

    def send_i_frame(self, asdu: bytes):
        header = _i_header(self.send_seq, self.recv_seq)
        frame = bytes([0x68, len(header) + len(asdu)]) + header + asdu
        self.writer.write(frame)
        self.send_seq = (self.send_seq + 1) % 32768

    def send_u_frame(self, control_byte: int):
        self.writer.write(_u_frame(control_byte))

    async def run(self):
        addr = self.writer.get_extra_info("peername")
        log.info(f"[IEC104] Master connected from {addr}")
        self.server._connections.append(self)
        try:
            while True:
                header = await self.reader.readexactly(2)
                if header[0] != 0x68:
                    log.warning(f"[IEC104] Bad start byte from {addr}, dropping connection")
                    break
                length = header[1]
                body = await self.reader.readexactly(length)
                await self._dispatch(body)
                await self.writer.drain()
        except (asyncio.IncompleteReadError, ConnectionResetError):
            pass
        finally:
            if self in self.server._connections:
                self.server._connections.remove(self)
            log.info(f"[IEC104] Master {addr} disconnected")
            self.writer.close()

    async def _dispatch(self, body: bytes):
        c0 = body[0]
        if c0 & 0x03 == 0x03:
            # U-format (unnumbered control)
            if c0 == STARTDT_ACT:
                self.data_transfer_active = True
                self.send_u_frame(STARTDT_CON)
                log.info("[IEC104] STARTDT ACT -> CON (data transfer active)")
            elif c0 == STOPDT_ACT:
                self.data_transfer_active = False
                self.send_u_frame(STOPDT_CON)
            elif c0 == TESTFR_ACT:
                self.send_u_frame(TESTFR_CON)
        elif c0 & 0x03 == 0x01:
            # S-format (supervisory) — nothing to send back
            pass
        else:
            # I-format (numbered information transfer)
            self.recv_seq = (self.recv_seq + 1) % 32768
            await self._handle_asdu(body[4:])

    async def _handle_asdu(self, asdu: bytes):
        type_id = asdu[0]
        ca = struct.unpack("<H", asdu[4:6])[0]

        if type_id == C_IC_NA_1:
            qoi = asdu[9]
            log.warning(f"[IEC104] GENERAL INTERROGATION received (QOI={qoi})")
            # A global interrogation arrives addressed to the broadcast CA
            # (0xFFFF); per IEC 60870-5-104 the outstation answers with its
            # OWN station address in every response frame, so use CA here
            # rather than echoing the request's broadcast address.
            self.send_i_frame(_asdu_header(C_IC_NA_1, 1, COT_ACTCON, CA) + _ioa(0) + bytes([qoi]))

            dp_items = [(ioa_num, self.server._values[name]) for ioa_num, (name, _d) in DOUBLE_POINTS.items()]
            self.send_i_frame(self.server._build_dp_asdu(dp_items, COT_INROGEN))

            sp_items = [(ioa_num, self.server._values[name]) for ioa_num, (name, _d) in SINGLE_POINTS.items()]
            self.send_i_frame(self.server._build_sp_asdu(sp_items, COT_INROGEN))

            me_items = [(ioa_num, self.server._values[name]) for ioa_num, (name, _d, _u) in MEASUREMENTS.items()]
            self.send_i_frame(self.server._build_me_asdu(me_items, COT_INROGEN))

            self.send_i_frame(_asdu_header(C_IC_NA_1, 1, COT_ACTTERM, CA) + _ioa(0) + bytes([qoi]))

        elif type_id == C_SC_NA_1:
            ioa_num = asdu[6] | (asdu[7] << 8) | (asdu[8] << 16)
            sco = asdu[9]
            value = bool(sco & 0x01)
            name = SINGLE_COMMANDS.get(ioa_num)
            if name:
                self.server._pending_writes[name] = value
                self.server._values[name] = value
                log.warning(f"[IEC104] DIRECT COMMAND IOA={ioa_num} ({name}) = {value}")
                self.send_i_frame(_asdu_header(C_SC_NA_1, 1, COT_ACTCON, ca) + _ioa(ioa_num) + bytes([sco]))
            else:
                log.warning(f"[IEC104] Command to unknown IOA={ioa_num} ignored")

        elif type_id == C_DC_NA_1:
            ioa_num = asdu[6] | (asdu[7] << 8) | (asdu[8] << 16)
            dco = asdu[9]
            dcs = dco & 0x03   # 1=OFF (trip/open), 2=ON (close)
            name = DOUBLE_COMMANDS.get(ioa_num)
            if name and dcs in (1, 2):
                value = (dcs == 2)
                self.server._pending_writes[name] = value
                self.server._values[name] = value
                log.warning(f"[IEC104] DOUBLE COMMAND IOA={ioa_num} ({name}) = "
                            f"{'CLOSE' if value else 'TRIP'}")
                self.send_i_frame(_asdu_header(C_DC_NA_1, 1, COT_ACTCON, ca) + _ioa(ioa_num) + bytes([dco]))
            else:
                log.warning(f"[IEC104] Double command to unknown/invalid IOA={ioa_num} dcs={dcs} ignored")
        else:
            log.warning(f"[IEC104] Unhandled ASDU type {type_id}")
