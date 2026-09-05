"""
Modbus/TCP RTU — Redwater Compressor Station (Scenario 4)

A natural-gas pipeline compressor station outstation spoken over real
Modbus/TCP (pymodbus), the same way Scenario 1 exposes the dam PLC. Because
this is genuine Modbus, standard tooling works against it directly:
  - nmap  --script modbus-discover   (fingerprint / device identity)
  - mbpoll                            (read every table, write coils/regs)
  - Metasploit auxiliary/scanner/scada/modbusclient

INTENTIONALLY VULNERABLE: no authentication, no encryption — any client can
read all telemetry and write any control coil or setpoint register.
"""

import logging

from pymodbus.datastore import (
    ModbusSequentialDataBlock,
    ModbusServerContext,
    ModbusSlaveContext,
)
from pymodbus.server import StartAsyncTcpServer
from pymodbus.device import ModbusDeviceIdentification

from pipeline_server.registers import (
    INPUT_REGISTERS, DISCRETE_INPUTS, COILS, HOLDING_REGISTERS,
    NUM_INPUT_REGISTERS, NUM_HOLDING_REGISTERS, NUM_COILS, NUM_DISCRETE_INPUTS,
    COIL_ADDR, HR_ADDR, to_register, from_register,
)

logger = logging.getLogger("pipeline_server")

# pymodbus table selectors used with get/setValues
_CO, _DI, _HR, _IR = 1, 2, 3, 4


class PipelineModbusServer:
    def __init__(self, host: str = "0.0.0.0", port: int = 5023):
        self.host = host
        self.port = port
        self.context = None
        self._build_context()

    # ── Data store ────────────────────────────────────────────────────────
    def _build_context(self):
        coils = ModbusSequentialDataBlock(0, [False] * NUM_COILS)
        discrete_inputs = ModbusSequentialDataBlock(0, [False] * NUM_DISCRETE_INPUTS)
        holding_registers = ModbusSequentialDataBlock(0, [0] * NUM_HOLDING_REGISTERS)
        input_registers = ModbusSequentialDataBlock(0, [0] * NUM_INPUT_REGISTERS)

        slave = ModbusSlaveContext(
            di=discrete_inputs, co=coils, hr=holding_registers, ir=input_registers,
        )
        self.context = ModbusServerContext(slaves=slave, single=True)
        self._set_initial_values()

    def _set_initial_values(self):
        """Restore control coils and setpoints to nominal operating state."""
        slave = self.context[0]
        for addr, meta in COILS.items():
            slave.setValues(_CO, addr, [bool(meta["default"])])
        for addr, meta in HOLDING_REGISTERS.items():
            slave.setValues(_HR, addr, [to_register(meta["default"], meta["scale"])])

    def reset(self):
        self._set_initial_values()
        logger.info("Pipeline Modbus RTU: coils and setpoints reset to defaults")

    # ── Simulation -> Modbus (read-only telemetry) ────────────────────────
    def update_from_simulation(self, pipeline_state: dict):
        """
        Push measurements (input registers) and status (discrete inputs) from
        the compressor model. Coils and holding registers are left untouched
        so attacker writes persist and are read back on the next tick.
        """
        slave = self.context[0]
        for addr, meta in INPUT_REGISTERS.items():
            val = pipeline_state.get(meta["name"], 0.0)
            slave.setValues(_IR, addr, [to_register(val, meta["scale"])])
        for addr, meta in DISCRETE_INPUTS.items():
            slave.setValues(_DI, addr, [bool(pipeline_state.get(meta["name"], False))])

    # ── Modbus -> simulation (attacker / operator writes) ─────────────────
    def read_attacker_writes(self) -> dict:
        """
        Return the current value of every writable control, keyed by the
        matching simulation attribute name. Consumed every tick so a coil or
        setpoint written by any Modbus client drives the process directly.
        """
        slave = self.context[0]
        writes = {}
        for addr, meta in COILS.items():
            writes[meta["name"]] = bool(slave.getValues(_CO, addr, count=1)[0])
        for addr, meta in HOLDING_REGISTERS.items():
            writes[meta["name"]] = from_register(
                slave.getValues(_HR, addr, count=1)[0], meta["scale"]
            )
        return writes

    def set_control(self, name: str, value):
        """Write a control coil / setpoint (used by the operator HMI buttons)."""
        slave = self.context[0]
        if name in COIL_ADDR:
            slave.setValues(_CO, COIL_ADDR[name], [bool(value)])
        elif name in HR_ADDR:
            addr = HR_ADDR[name]
            slave.setValues(_HR, addr, [to_register(float(value), HOLDING_REGISTERS[addr]["scale"])])

    # ── Device identity (nmap modbus-discover / -sV fingerprint) ──────────
    def _build_identity(self) -> ModbusDeviceIdentification:
        identity = ModbusDeviceIdentification()
        identity.VendorName          = "Emerson"
        identity.ProductCode         = "ROC800L"
        identity.VendorUrl           = "https://www.emerson.com"
        identity.ProductName         = "ROC800L Remote Operations Controller"
        identity.ModelName           = "Redwater CS RTU"
        identity.MajorMinorRevision  = "3.8"
        identity.UserApplicationName = "Redwater Pipeline SCADA"
        return identity

    async def start(self):
        logger.info(f"[MODBUS-PIPE] Redwater Compressor Station RTU on {self.host}:{self.port}")
        logger.info(f"[MODBUS-PIPE]   Points: {len(INPUT_REGISTERS)} IR, "
                    f"{len(DISCRETE_INPUTS)} DI, {len(COILS)} coils, "
                    f"{len(HOLDING_REGISTERS)} HR | Auth: NONE (intentionally vulnerable)")
        await StartAsyncTcpServer(
            context=self.context,
            identity=self._build_identity(),
            address=(self.host, self.port),
        )
