"""
Modbus TCP Server using pymodbus.
Exposes PLC registers on port 502 (standard Modbus port).

INTENTIONALLY VULNERABLE:
- No authentication
- No encryption
- Any client can read/write any register
- This mirrors real-world ICS vulnerabilities
"""

import asyncio
import logging

from pymodbus.datastore import (
    ModbusSequentialDataBlock,
    ModbusServerContext,
    ModbusSlaveContext,
)
from pymodbus.server import StartAsyncTcpServer
from pymodbus.device import ModbusDeviceIdentification

from modbus_server.registers import (
    NUM_COILS,
    NUM_HOLDING_REGISTERS,
    float_to_register,
)

logger = logging.getLogger(__name__)


class ModbusPLCServer:
    def __init__(self, host: str = "0.0.0.0", port: int = 5020):
        self.host = host
        self.port = port  # Using 5020 instead of 502 to avoid needing root
        self.context = None
        self._build_context()

    def _build_context(self):
        """Build the Modbus data store with initial values."""
        # Create data blocks
        # ModbusSequentialDataBlock(start_address, values)
        coils = ModbusSequentialDataBlock(0, [False] * NUM_COILS)
        discrete_inputs = ModbusSequentialDataBlock(0, [False] * NUM_COILS)
        holding_registers = ModbusSequentialDataBlock(
            0, [0] * NUM_HOLDING_REGISTERS
        )
        input_registers = ModbusSequentialDataBlock(
            0, [0] * NUM_HOLDING_REGISTERS
        )

        # Create slave context (single slave, unit_id=1)
        slave = ModbusSlaveContext(
            di=discrete_inputs,
            co=coils,
            hr=holding_registers,
            ir=input_registers,
        )

        # Server context (single device)
        self.context = ModbusServerContext(slaves=slave, single=True)

        # Set initial safe values
        self._set_initial_values()

    def _set_initial_values(self):
        """Set registers to initial safe operating values."""
        slave = self.context[0]

        # Holding registers (address, value) — scaled by 100
        initial_values = {
            0: float_to_register(50.0),   # water level: 50m
            1: float_to_register(120.0),  # inflow: 120 m³/s
            2: float_to_register(120.0),  # outflow: 120 m³/s
            3: float_to_register(40.0),   # gate: 40% open
            4: float_to_register(2.5),    # chlorine: 2.5 ppm
            5: float_to_register(7.2),    # pH: 7.2
            6: float_to_register(1.5),    # turbidity: 1.5 NTU
            7: float_to_register(60.0),   # tank: 60%
            8: float_to_register(55.0),   # pressure: 55 PSI
        }

        for addr, val in initial_values.items():
            slave.setValues(3, addr, [val])  # 3 = holding registers

        # Coils (pumps on, alarms off)
        slave.setValues(1, 0, [False])  # gate command: closed
        slave.setValues(1, 1, [True])   # intake pump: on
        slave.setValues(1, 2, [True])   # chemical pump: on
        slave.setValues(1, 3, [True])   # distribution pump: on
        slave.setValues(1, 4, [False])  # high level alarm: off
        slave.setValues(1, 5, [False])  # chemical alarm: off

    def read_attacker_writes(self) -> dict:
        """
        Read registers/coils that an attacker may have written via Modbus.
        Compares current Modbus values against expected simulation values
        to detect external writes. Returns only the values that were changed.
        """
        slave = self.context[0]
        writes = {}

        # Check writable setpoints (registers 3 and 4)
        gate_reg = slave.getValues(3, 3, count=1)[0] / 100.0
        chlorine_reg = slave.getValues(3, 4, count=1)[0] / 100.0
        writes["gate_position_setpoint"] = gate_reg
        writes["chlorine_dosing_rate"] = chlorine_reg

        # Check coils (0-3 are controllable)
        writes["gate_command"] = slave.getValues(1, 0, count=1)[0]
        writes["intake_pump"] = slave.getValues(1, 1, count=1)[0]
        writes["chemical_pump"] = slave.getValues(1, 2, count=1)[0]
        writes["distribution_pump"] = slave.getValues(1, 3, count=1)[0]

        return writes

    def update_from_simulation(self, dam_state: dict, plant_state: dict):
        """
        Sync simulation state to Modbus registers.
        Only updates read-only / sensor registers. Writable setpoint
        registers (3, 4) and coils (0-3) are left alone so that
        attacker writes persist and are not overwritten.
        """
        slave = self.context[0]

        # Update SENSOR registers (read-only from attacker's perspective
        # but we write them so Modbus reads reflect the simulation)
        slave.setValues(3, 0, [float_to_register(dam_state["water_level"])])
        slave.setValues(3, 1, [float_to_register(dam_state["inflow_rate"])])
        slave.setValues(3, 2, [float_to_register(dam_state["outflow_rate"])])
        # Register 3 (gate setpoint) — DO NOT overwrite; attacker writes must persist
        # Register 4 (chlorine rate) — DO NOT overwrite; attacker writes must persist
        slave.setValues(3, 5, [float_to_register(plant_state["ph_level"])])
        slave.setValues(3, 6, [float_to_register(plant_state["turbidity"])])
        slave.setValues(3, 7, [float_to_register(plant_state["tank_level"])])
        slave.setValues(3, 8, [float_to_register(plant_state["distribution_pressure"])])

        # Update alarm coils (4-5 are read-only status indicators)
        slave.setValues(1, 4, [dam_state["high_level_alarm"]])
        slave.setValues(1, 5, [plant_state["chemical_alarm"]])

    def read_coil_commands(self) -> dict:
        """
        Read coil values that may have been written by an attacker.
        Returns commands that should be applied to the simulation.
        """
        slave = self.context[0]
        return {
            "gate_command": slave.getValues(1, 0, count=1)[0],
            "intake_pump": slave.getValues(1, 1, count=1)[0],
            "chemical_pump": slave.getValues(1, 2, count=1)[0],
            "distribution_pump": slave.getValues(1, 3, count=1)[0],
        }

    def read_register_overrides(self) -> dict:
        """
        Read holding register values that may have been written by an attacker.
        Used to detect if an attacker has modified setpoints.
        """
        slave = self.context[0]
        return {
            "gate_position_setpoint": slave.getValues(3, 3, count=1)[0] / 100.0,
            "chlorine_dosing_rate": slave.getValues(3, 4, count=1)[0] / 100.0,
        }

    def _build_identity(self) -> ModbusDeviceIdentification:
        """
        Device Identification (Modbus function 0x2B / MEI 0x0E).
        Lets recon tools (nmap `modbus-discover`, `-sV`, Metasploit) positively
        fingerprint this as a real Modbus PLC — mirrors a fielded Schneider
        Modicon dam controller instead of an anonymous open port.
        """
        identity = ModbusDeviceIdentification()
        identity.VendorName          = "Schneider Electric"
        identity.ProductCode         = "BMXP342020"
        identity.VendorUrl           = "https://www.se.com"
        identity.ProductName         = "Modicon M340 PLC"
        identity.ModelName           = "HydraGuard Dam Controller"
        identity.MajorMinorRevision  = "2.7"
        identity.UserApplicationName = "HydraGuard SCADA"
        return identity

    async def start(self):
        """Start the Modbus TCP server."""
        logger.info(f"Starting Modbus TCP server on {self.host}:{self.port}")
        await StartAsyncTcpServer(
            context=self.context,
            identity=self._build_identity(),
            address=(self.host, self.port),
        )
