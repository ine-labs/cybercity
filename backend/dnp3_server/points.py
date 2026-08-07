"""
DNP3 Point Map — Meridian Compressor Station 7 Outstation.

DNP3 organizes data into point Groups using real IEEE/DNP3 Technical
Committee numbering:
  Group 1  — Binary Input        (status, read-only)
  Group 30 — Analog Input        (measurements, read-only)
  Group 12 — Binary Output/CROB  (Control Relay Output Block, writable)
  Group 40 — Analog Output       (writable setpoints)

Object reference format used by this server: "G{group}V{index}"
Example: G30V1 = Analog Input index 1 (discharge_pressure)
"""

# Group 30 — Analog Input (read-only measurements)
ANALOG_INPUTS = {
    0: {"name": "suction_pressure",   "unit": "psi",    "desc": "Suction header pressure"},
    1: {"name": "discharge_pressure", "unit": "psi",    "desc": "Discharge header pressure"},
    2: {"name": "compressor_rpm",     "unit": "RPM",    "desc": "Compressor shaft speed"},
    3: {"name": "discharge_temp",     "unit": "F",      "desc": "Discharge gas temperature"},
    4: {"name": "vibration",          "unit": "mils",   "desc": "Compressor bearing vibration"},
    5: {"name": "flow_rate",          "unit": "MMSCFD", "desc": "Gas flow rate"},
    6: {"name": "pipe_stress",        "unit": "%",      "desc": "Pipeline structural fatigue index"},
}

# Group 1 — Binary Input (read-only status)
BINARY_INPUTS = {
    0: {"name": "suction_valve_open",   "desc": "Suction block valve position"},
    1: {"name": "discharge_valve_open", "desc": "Discharge block valve position"},
    2: {"name": "blowdown_valve_open",  "desc": "Blowdown/vent valve position"},
    3: {"name": "esd_tripped",          "desc": "ESD system has tripped"},
    4: {"name": "prv_relieving",        "desc": "Mechanical PRV actively venting"},
    5: {"name": "ruptured",             "desc": "Pipeline segment integrity failure"},
    6: {"name": "high_pressure_alarm",  "desc": "Discharge pressure above MAOP"},
    7: {"name": "high_vibration_alarm", "desc": "Vibration above alarm threshold"},
    8: {"name": "overspeed_alarm",      "desc": "Compressor RPM above safe limit"},
}

# Group 12 — Binary Output / CROB (writable control points)
BINARY_OUTPUTS = {
    0: {"name": "esd_armed",              "desc": "ATTACKABLE - SIS/ESD system armed (false = bypassed)"},
    1: {"name": "prv_block_valve_closed", "desc": "ATTACKABLE - mechanical PRV isolation valve"},
    2: {"name": "suction_valve_open",     "desc": "ATTACKABLE - suction block valve command"},
    3: {"name": "discharge_valve_open",   "desc": "ATTACKABLE - discharge block valve command"},
    4: {"name": "blowdown_valve_open",    "desc": "ATTACKABLE - manual blowdown valve override"},
    5: {"name": "telemetry_spoofed",      "desc": "UNDOCUMENTED - engineering diagnostic override, freezes reported telemetry"},
}

# Group 40 — Analog Output (writable setpoints)
ANALOG_OUTPUTS = {
    0: {"name": "rpm_setpoint", "unit": "RPM", "desc": "ATTACKABLE - compressor speed setpoint"},
}

GROUP_TABLE_NAME = {1: "BI", 30: "AI", 12: "BO", 40: "AO"}
