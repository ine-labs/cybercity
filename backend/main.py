"""
CyberCity ICS — Main Application
FastAPI server with Socket.IO for real-time communication.
Orchestrates all scenario simulations, Modbus server, SNMP agent, and IEC 104 outstation.
"""

import asyncio
import logging

import socketio
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from simulation.process_engine import ProcessEngine
from modbus_server.server import ModbusPLCServer
from snmp_server.agent import SNMPTrafficController
from iec104_server.server import IEC104OutstationServer
from dnp3_server.server import DNP3OutstationServer
from comms_gateway.server import CommsGateway
from comms_gateway.field_poll import FieldPoller
from operator_hmi import OperatorHMI

# Logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)
logger = logging.getLogger("cybercity")

# Socket.IO server
sio = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins="*",
)

# FastAPI app
api = FastAPI(
    title="CyberCity ICS",
    description="ICS/OT Cybersecurity Training Platform",
    version="3.0.0",
)

api.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Wrap FastAPI with Socket.IO
app = socketio.ASGIApp(sio, other_asgi_app=api)

# Global simulation engine and protocol servers
engine        = ProcessEngine()
modbus_server = ModbusPLCServer(host="0.0.0.0", port=5020)
snmp_server   = SNMPTrafficController(host="0.0.0.0", port=5021)
iec104        = IEC104OutstationServer(host="0.0.0.0", port=5022)
dnp3_server   = DNP3OutstationServer(host="0.0.0.0", port=5023)

# Legacy serial-to-Ethernet gateway for the wastewater lift station (UDP flood target)
comms_gateway = CommsGateway(host="0.0.0.0", port=5025)

# Real field polling traffic to the gateway, so there's genuine wire traffic to
# capture (Scenario 5, Phase 2) and something for a flood to actually starve
field_poller  = FieldPoller(host="127.0.0.1", port=5025)

# Simulated plant operator HMI — continuously polls the Modbus PLC so the
# network carries genuine operator↔PLC traffic to eavesdrop on (Scenario 1, Phase 2)
operator_hmi  = OperatorHMI(host="127.0.0.1", port=5020)


# ─── Socket.IO Events ────────────────────────────────────────────────

@sio.event
async def connect(sid, environ):
    logger.info(f"Client connected: {sid}")
    state  = engine.get_displayed_state()
    actual = engine.get_actual_state()
    await sio.emit("process_update", {
        "displayed": state,
        "actual":    actual,
    }, room=sid)


@sio.event
async def disconnect(sid):
    logger.info(f"Client disconnected: {sid}")


@sio.event
async def manual_control(sid, data):
    """Handle manual control commands from the HMI."""
    logger.info(f"Manual control from {sid}: {data}")
    command = data.get("command")
    value   = data.get("value")
    slave   = modbus_server.context[0]

    # ─── Dam / Treatment Plant ───────────────────────────────────────
    if command == "set_gate":
        gate_val = float(value)
        engine.dam.set_gate_target(gate_val)
        slave.setValues(3, 3, [int(round(gate_val * 100))])
    elif command == "toggle_intake_pump":
        engine.plant.intake_pump = not engine.plant.intake_pump
        slave.setValues(1, 1, [engine.plant.intake_pump])
    elif command == "toggle_chemical_pump":
        engine.plant.chemical_pump = not engine.plant.chemical_pump
        slave.setValues(1, 2, [engine.plant.chemical_pump])
    elif command == "toggle_distribution_pump":
        engine.plant.distribution_pump = not engine.plant.distribution_pump
        slave.setValues(1, 3, [engine.plant.distribution_pump])
    elif command == "set_chlorine_dosing":
        chlorine_val = float(value)
        engine.plant.chlorine_dosing_rate = chlorine_val
        slave.setValues(3, 4, [int(round(chlorine_val * 100))])

    # ─── Traffic scenario ────────────────────────────────────────────
    elif command == "set_ns_green":
        engine.traffic.ns_green_time = float(value)
        snmp_server._values[snmp_server._oid_by_name("ns_green_time")] = int(value)
    elif command == "set_ew_green":
        engine.traffic.ew_green_time = float(value)
        snmp_server._values[snmp_server._oid_by_name("ew_green_time")] = int(value)
    elif command == "set_phase_hold":
        engine.traffic.phase_hold = int(value)
        snmp_server._values[snmp_server._oid_by_name("phase_hold")] = int(value)
    elif command == "set_preemption":
        engine.traffic.preemption_active = int(value)
        snmp_server._values[snmp_server._oid_by_name("preemption_active")] = int(value)
    elif command == "toggle_conflict_monitor":
        engine.traffic.conflict_monitor_enabled = not engine.traffic.conflict_monitor_enabled
        val = 1 if engine.traffic.conflict_monitor_enabled else 0
        snmp_server._values[snmp_server._oid_by_name("conflict_monitor_enabled")] = val

    # ─── Power Grid scenario ─────────────────────────────────────────
    elif command == "grid_trip_cb":
        idx = int(value)
        engine.grid.trip_cb(idx, reason="operator-HMI")
    elif command == "grid_close_cb":
        idx = int(value)
        engine.grid.close_cb(idx, reason="operator-HMI")
    elif command == "grid_toggle_protection":
        engine.grid.protection_enabled = not engine.grid.protection_enabled
        iec104._values["PROT1"] = engine.grid.protection_enabled
    elif command == "grid_toggle_diff_prot":
        engine.grid.diff_prot_enabled = not engine.grid.diff_prot_enabled
        iec104._values["DFPT1"] = engine.grid.diff_prot_enabled
    elif command == "grid_toggle_overcurrent":
        engine.grid.overcurrent_enabled = not engine.grid.overcurrent_enabled
        iec104._values["OCPT1"] = engine.grid.overcurrent_enabled
    elif command == "grid_toggle_underfreq":
        engine.grid.underfreq_enabled = not engine.grid.underfreq_enabled
        iec104._values["UFPT1"] = engine.grid.underfreq_enabled
    elif command == "grid_toggle_autorecloser":
        engine.grid.autorecloser_enabled = not engine.grid.autorecloser_enabled
        iec104._values["RREC1"] = engine.grid.autorecloser_enabled
    elif command == "grid_reset":
        engine.grid.reset()
        iec104.reset()

    # ─── Pipeline Compressor Station scenario ─────────────────────────
    elif command == "pipeline_set_rpm":
        engine.pipeline.set_rpm_setpoint(float(value))
        dnp3_server._values[("AO", 0)] = engine.pipeline.rpm_setpoint
    elif command == "pipeline_toggle_esd_armed":
        engine.pipeline.esd_armed = not engine.pipeline.esd_armed
        dnp3_server._values[("BO", 0)] = engine.pipeline.esd_armed
    elif command == "pipeline_toggle_prv_block":
        engine.pipeline.prv_block_valve_closed = not engine.pipeline.prv_block_valve_closed
        dnp3_server._values[("BO", 1)] = engine.pipeline.prv_block_valve_closed
    elif command == "pipeline_toggle_suction_valve":
        engine.pipeline.suction_valve_open = not engine.pipeline.suction_valve_open
        dnp3_server._values[("BO", 2)] = engine.pipeline.suction_valve_open
    elif command == "pipeline_toggle_discharge_valve":
        engine.pipeline.discharge_valve_open = not engine.pipeline.discharge_valve_open
        dnp3_server._values[("BO", 3)] = engine.pipeline.discharge_valve_open
    elif command == "pipeline_set_blowdown_valve":
        engine.pipeline.blowdown_valve_open = bool(value)
        dnp3_server._values[("BO", 4)] = engine.pipeline.blowdown_valve_open
    elif command == "pipeline_toggle_spoof":
        engine.pipeline.telemetry_spoofed = not engine.pipeline.telemetry_spoofed
        dnp3_server._values[("BO", 5)] = engine.pipeline.telemetry_spoofed
    elif command == "pipeline_reset":
        engine.pipeline.reset()
        dnp3_server.reset()

    # ─── Wastewater Lift Station scenario ─────────────────────────────
    elif command == "lift_toggle_pump":
        engine.lift.toggle_pump()
    elif command == "lift_reset":
        engine.lift.reset()
        comms_gateway.reset()


# ─── REST API Endpoints ──────────────────────────────────────────────

@api.get("/api/status")
async def get_status():
    return {
        "displayed":    engine.get_displayed_state(),
        "actual":       engine.get_actual_state(),
        "modbus_port":  modbus_server.port,
        "snmp_port":    snmp_server.port,
        "iec104_port":  iec104.port,
        "dnp3_port":    dnp3_server.port,
        "gateway_port": comms_gateway.port,
        "gateway":      comms_gateway.status(),
    }


@api.post("/api/reset")
async def reset_simulation():
    engine.reset()
    modbus_server._set_initial_values()
    snmp_server.reset()
    iec104.reset()
    dnp3_server.reset()
    comms_gateway.reset()
    logger.info("All simulations reset to safe defaults")
    return {"status": "reset", "message": "All systems returned to normal"}


# ─── Simulation Loop ─────────────────────────────────────────────────

async def pre_tick_sync():
    """Called BEFORE each tick — reads attacker writes from all protocol servers."""

    # ─── Dam scenario (Modbus) ───────────────────────────────────────
    writes = modbus_server.read_attacker_writes()
    engine.dam.set_gate_target(writes["gate_position_setpoint"])
    engine.plant.chlorine_dosing_rate = writes["chlorine_dosing_rate"]
    if writes["gate_command"]:
        engine.dam.set_gate_target(100.0)
    engine.plant.intake_pump        = writes["intake_pump"]
    engine.plant.chemical_pump      = writes["chemical_pump"]
    engine.plant.distribution_pump  = writes["distribution_pump"]

    # ─── Traffic scenario (SNMP) ─────────────────────────────────────
    traffic_writes = snmp_server.read_attacker_writes()
    engine.traffic.ns_green_time          = float(traffic_writes["ns_green_time"])
    engine.traffic.ew_green_time          = float(traffic_writes["ew_green_time"])
    engine.traffic.phase_hold             = traffic_writes["phase_hold"]
    engine.traffic.preemption_active      = traffic_writes["preemption_active"]
    engine.traffic.conflict_monitor_enabled = bool(traffic_writes["conflict_monitor_enabled"])

    # ─── Power Grid scenario (IEC 60870-5-104) ───────────────────────
    grid_writes = iec104.read_attacker_writes()
    for name, value in grid_writes.items():
        # CB controls — C_SC_NA_1 direct command: true=close, false=trip
        if name.startswith("XCBR"):
            try:
                cb_idx = int(name[4:]) - 1   # "XCBR3" → index 2
                if value:
                    engine.grid.close_cb(cb_idx, reason="IEC104")
                else:
                    engine.grid.trip_cb(cb_idx, reason="IEC104")
            except (IndexError, ValueError):
                pass
        # Protection relay enables
        elif name == "PROT1":
            engine.grid.protection_enabled = bool(value)
        elif name == "DFPT1":
            engine.grid.diff_prot_enabled = bool(value)
        elif name == "OCPT1":
            engine.grid.overcurrent_enabled = bool(value)
        elif name == "UFPT1":
            engine.grid.underfreq_enabled = bool(value)
        elif name == "RREC1":
            engine.grid.autorecloser_enabled = bool(value)

    # ─── Pipeline Compressor Station (DNP3 Direct Operate writes) ───────
    pipeline_writes = dnp3_server.read_attacker_writes()
    for name, value in pipeline_writes.items():
        if name == "rpm_setpoint":
            engine.pipeline.set_rpm_setpoint(float(value))
        elif name == "esd_armed":
            engine.pipeline.esd_armed = bool(value)
        elif name == "prv_block_valve_closed":
            engine.pipeline.prv_block_valve_closed = bool(value)
        elif name == "suction_valve_open":
            engine.pipeline.suction_valve_open = bool(value)
        elif name == "discharge_valve_open":
            engine.pipeline.discharge_valve_open = bool(value)
        elif name == "blowdown_valve_open":
            engine.pipeline.blowdown_valve_open = bool(value)
        elif name == "telemetry_spoofed":
            engine.pipeline.telemetry_spoofed = bool(value)

    # ─── Wastewater Lift Station: gateway load -> field comms health ─────
    engine.lift.field_comms_ok   = not comms_gateway.saturated
    engine.lift.gateway_pkt_rate = comms_gateway.packet_rate
    engine.lift.gateway_capacity = comms_gateway.CAPACITY_PPS


async def post_tick_sync(displayed_state: dict, actual_state: dict):
    """Called AFTER each tick — pushes simulation values to protocol servers and WebSocket."""

    # Sync dam → Modbus
    modbus_server.update_from_simulation(
        actual_state["dam"], actual_state["plant"]
    )

    # Sync traffic → SNMP
    snmp_server.update_from_simulation(actual_state["traffic"])

    # Sync grid → IEC 60870-5-104 outstation
    iec104.update_from_simulation(actual_state["grid"])

    # Sync pipeline → DNP3 outstation
    dnp3_server.update_from_simulation(actual_state["pipeline"])

    # Push to all WebSocket clients
    await sio.emit("process_update", {
        "displayed": displayed_state,
        "actual":    actual_state,
    })


@api.on_event("startup")
async def startup():
    logger.info("=" * 60)
    logger.info("  CyberCity ICS — Starting Up")
    logger.info("  ICS/OT Cybersecurity Training Platform")
    logger.info("=" * 60)

    asyncio.create_task(modbus_server.start())
    logger.info(f"Modbus TCP server starting on port {modbus_server.port}")

    asyncio.create_task(snmp_server.start())
    logger.info(f"SNMP agent starting on UDP port {snmp_server.port}")

    asyncio.create_task(iec104.start())
    logger.info(f"IEC 60870-5-104 outstation starting on TCP port {iec104.port}")

    asyncio.create_task(dnp3_server.start())
    logger.info(f"DNP3 outstation starting on TCP port {dnp3_server.port}")

    asyncio.create_task(comms_gateway.start())
    logger.info(f"Serial-to-Ethernet gateway starting on UDP port {comms_gateway.port}")

    asyncio.create_task(field_poller.start())
    logger.info("Field poller starting — live polling traffic on UDP 5025")

    asyncio.create_task(operator_hmi.start())
    logger.info("Operator HMI (Modbus master) starting — live polling traffic on 5020")

    asyncio.create_task(
        engine.run_loop(on_pre_tick=pre_tick_sync, on_tick=post_tick_sync)
    )
    logger.info("Process simulation started (tick interval: 0.5s)")


# ─── Entry Point ──────────────────────────────────────────────────────

if __name__ == "__main__":
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8000,
        log_level="info",
    )
