"""
IEC 60870-5-104 Point Map — Copperline Substation

Real IEC 104 addressing: every data point is identified by an Information
Object Address (IOA) plus the ASDU Type ID that carries it. A status point
and its corresponding control point commonly share the same IOA since they
travel as different ASDU types.

Circuit breakers use DOUBLE-point status/command (a breaker reports two
auxiliary contacts — open and closed — so a mismatch is itself a fault
indication), matching real substation practice and the default example in
Metasploit's auxiliary/client/iec104/iec104 module (COMMAND_TYPE=46).
Protection relay enables are simple booleans, so they use single-point.

Common Address of ASDU (CA): 1  (single station: Copperline Substation IED)
"""

CA = 1  # Common Address of ASDU — identifies this station

# ── Double-point status (M_DP_NA_1, Type ID 3) — read-only ─────────────────
# IOA -> (name, description)
DOUBLE_POINTS = {
    1: ("XCBR1", "CB1 position (Line 1 / Gen source)"),
    2: ("XCBR2", "CB2 position (Line 2 / Grid source)"),
    3: ("XCBR3", "CB3 position (TX1 primary)"),
    4: ("XCBR4", "CB4 position (TX2 primary)"),
    5: ("XCBR5", "CB5 position (Feeder A / Industrial)"),
    6: ("XCBR6", "CB6 position (Feeder B / Residential)"),
    7: ("XCBR7", "CB7 position (Feeder C / Critical)"),
}

# ── Double command (C_DC_NA_1, Type ID 46) — ATTACKABLE, same IOAs as above ─
DOUBLE_COMMANDS = {
    1: "XCBR1", 2: "XCBR2", 3: "XCBR3", 4: "XCBR4",
    5: "XCBR5", 6: "XCBR6", 7: "XCBR7",
}

CB_IOA = {1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 7: 6}  # IOA -> cb_states index

# ── Single-point status (M_SP_NA_1, Type ID 1) — read-only ────────────────
SINGLE_POINTS = {
    101: ("PROT1", "Master protection relay enabled"),
    102: ("DFPT1", "87T differential protection enabled"),
    103: ("OCPT1", "51 overcurrent protection enabled"),
    104: ("UFPT1", "81L under-frequency load-shedding enabled"),
    105: ("RREC1", "79 auto-recloser enabled"),
    300: ("BLACKOUT", "Grid blackout status"),
}

# ── Single command (C_SC_NA_1, Type ID 45) — ATTACKABLE, same IOAs as above ─
SINGLE_COMMANDS = {
    101: "PROT1", 102: "DFPT1", 103: "OCPT1", 104: "UFPT1", 105: "RREC1",
}

# ── Measured value, short floating point (M_ME_NC_1, Type ID 13) — read-only
MEASUREMENTS = {
    201: ("FREQUENCY", "System frequency", "Hz"),
    202: ("HV_VOLTAGE", "230kV HV bus voltage", "kV"),
    203: ("LV_VOLTAGE", "115kV LV bus voltage", "kV"),
    204: ("ACTIVE_POWER", "Total active power", "MW"),
    205: ("REACTIVE_POWER", "Total reactive power", "MVAR"),
    206: ("POWER_FACTOR", "Power factor", "pu"),
    207: ("TX1_LOAD", "TX1 loading", "%"),
    208: ("TX2_LOAD", "TX2 loading", "%"),
    209: ("TX1_TEMP", "TX1 winding temperature", "C"),
    210: ("TX2_TEMP", "TX2 winding temperature", "C"),
    211: ("GRID_STRESS", "Grid stress index", "%"),
}
