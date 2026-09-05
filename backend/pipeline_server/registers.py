"""
Modbus register map — Redwater Compressor Station (Scenario 4).

A natural-gas pipeline compressor station RTU exposed over Modbus/TCP,
the way gas-pipeline field devices are genuinely fielded. Modbus has four
data tables; this RTU uses all four so real tooling maps cleanly:

  Discrete Inputs  (FC02, read-only)   status flags / valve positions
  Coils            (FC01/05, r/w)      control commands   <- ATTACKABLE
  Input Registers  (FC04, read-only)   analog measurements
  Holding Registers(FC03/06/16, r/w)   analog setpoints   <- ATTACKABLE

Analog values are 16-bit, so floats are scaled to integers by the `scale`
factor below (e.g. discharge_pressure 680.0 psi with scale 10 -> 6800).

INTENTIONALLY VULNERABLE: no authentication, no encryption. Any TCP client
can read every point and write any coil or holding register — mirroring
the DHS/CISA-flagged reality of legacy pipeline Modbus deployments.
"""

# ── Input Registers (FC04, read-only) — analog telemetry ──────────────────
INPUT_REGISTERS = {
    0: {"name": "suction_pressure",   "unit": "psi",    "scale": 10},
    1: {"name": "discharge_pressure", "unit": "psi",    "scale": 10},
    2: {"name": "compressor_rpm",     "unit": "RPM",    "scale": 1},
    3: {"name": "discharge_temp",     "unit": "F",      "scale": 10},
    4: {"name": "vibration",          "unit": "mils",   "scale": 100},
    5: {"name": "flow_rate",          "unit": "MMSCFD", "scale": 10},
    6: {"name": "pipe_stress",        "unit": "%",      "scale": 100},
}

# ── Discrete Inputs (FC02, read-only) — status ────────────────────────────
DISCRETE_INPUTS = {
    0: {"name": "suction_valve_open",   "desc": "Suction block valve position"},
    1: {"name": "discharge_valve_open", "desc": "Discharge block valve position"},
    2: {"name": "blowdown_valve_open",  "desc": "Blowdown/vent valve position"},
    3: {"name": "esd_tripped",          "desc": "ESD system has tripped"},
    4: {"name": "prv_relieving",        "desc": "Mechanical PRV actively venting"},
    5: {"name": "ruptured",             "desc": "Pipeline segment integrity failure"},
    6: {"name": "high_pressure_alarm",  "desc": "Discharge pressure above MAOP"},
    7: {"name": "high_vibration_alarm", "desc": "Vibration above alarm threshold"},
    8: {"name": "overspeed_alarm",      "desc": "Compressor RPM above safe limit"},
    9: {"name": "high_temp_alarm",      "desc": "Discharge temperature above limit"},
}

# ── Coils (FC01/05, read/write) — control commands, ATTACKABLE ────────────
# Coil `name` fields match the simulation attribute names so the tick sync
# can map a coil straight onto the compressor model with no translation.
COILS = {
    0: {"name": "esd_armed",              "default": True,  "desc": "SIS/ESD armed (write 0 = bypass safety trip)"},
    1: {"name": "prv_block_valve_closed", "default": False, "desc": "PRV isolation valve (write 1 = block mechanical relief)"},
    2: {"name": "suction_valve_open",     "default": True,  "desc": "Suction block valve command"},
    3: {"name": "discharge_valve_open",   "default": True,  "desc": "Discharge block valve command (write 0 = deadhead risk)"},
    4: {"name": "blowdown_valve_open",    "default": False, "desc": "Blowdown/vent valve command"},
    5: {"name": "telemetry_spoofed",      "default": False, "desc": "Engineering telemetry override (write 1 = freeze reported readings)"},
}

# ── Holding Registers (FC03/06/16, read/write) — setpoints, ATTACKABLE ─────
HOLDING_REGISTERS = {
    0: {"name": "rpm_setpoint", "unit": "RPM", "scale": 1, "default": 9500},
}

# Reserved table sizes (a little headroom past the last used address)
NUM_INPUT_REGISTERS   = 16
NUM_HOLDING_REGISTERS = 8
NUM_COILS             = 12
NUM_DISCRETE_INPUTS   = 16

# Reverse lookups: simulation attribute name -> address
COIL_ADDR = {meta["name"]: addr for addr, meta in COILS.items()}
HR_ADDR   = {meta["name"]: addr for addr, meta in HOLDING_REGISTERS.items()}


def to_register(value: float, scale: int) -> int:
    """Scale a float to a 16-bit register value, clamped to 0..65535."""
    return max(0, min(65535, int(round(value * scale))))


def from_register(value: int, scale: int) -> float:
    """Scale a register value back to a float."""
    return value / scale
