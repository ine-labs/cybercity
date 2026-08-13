"""
Simulated Operator HMI — a Modbus master that continuously polls the PLC.

Represents the plant's real SCADA/HMI master reading the process over Modbus/TCP.
Its purpose is to put genuine operator<->PLC traffic on the wire, so that the
eavesdropping phase is real passive interception: a student captures the
operator's live polling session (traffic they did NOT generate themselves)
rather than sniffing their own requests.

Like the PLC it talks to, this link is intentionally cleartext with no
authentication — exactly how HMI<->PLC Modbus polling looks in the field.
"""

import asyncio
import logging

from pymodbus.client import AsyncModbusTcpClient

logger = logging.getLogger("operator_hmi")


class OperatorHMI:
    POLL_INTERVAL = 1.0   # seconds between operator poll cycles
    STARTUP_DELAY = 2.0   # let the PLC server bind before first connect
    RECONNECT_DELAY = 2.0 # backoff before re-establishing a dropped link

    def __init__(self, host: str = "127.0.0.1", port: int = 5020, unit_id: int = 1):
        self.host = host
        self.port = port
        self.unit_id = unit_id
        self.running = False

    async def start(self):
        """Maintain a persistent Modbus session and poll the PLC on an interval."""
        self.running = True
        await asyncio.sleep(self.STARTUP_DELAY)
        logger.info(
            f"Operator HMI polling PLC at {self.host}:{self.port} "
            f"every {self.POLL_INTERVAL}s (cleartext Modbus, no auth)"
        )

        while self.running:
            client = AsyncModbusTcpClient(self.host, port=self.port)
            try:
                await client.connect()
                while self.running and client.connected:
                    try:
                        # A real HMI polls the same points every cycle: the 9
                        # process holding registers and the 6 pump/gate/alarm coils.
                        await client.read_holding_registers(0, count=9)
                        await client.read_coils(0, count=6)
                    except Exception as e:  # noqa: BLE001 — keep the operator alive
                        logger.debug(f"Operator poll error: {e}")
                        break
                    await asyncio.sleep(self.POLL_INTERVAL)
            except Exception as e:  # noqa: BLE001 — connection failures are expected at startup
                logger.debug(f"Operator HMI connection error: {e}")
            finally:
                client.close()
            if self.running:
                await asyncio.sleep(self.RECONNECT_DELAY)

    def stop(self):
        self.running = False