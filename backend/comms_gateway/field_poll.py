"""
Simulated field polling — the station PLC's real query traffic to the serial
gateway over UDP.

Represents the field-side polling that a real remote lift station does: the PLC
(or the SCADA master reading through it) repeatedly asks the serial gateway for
the current sensor readings. Its purpose is to put genuine query/response
traffic on the wire, so a student's Wireshark capture (Phase 2) shows real
periodic packets to sniff rather than an empty link.

Like the gateway it talks to, this link is intentionally cleartext with no
authentication — exactly how a legacy serial-to-Ethernet bridge looks in the
field. When the gateway is flooded and saturated, these polls simply stop
getting replies, which is what starves the control loop.
"""

import asyncio
import logging

logger = logging.getLogger("field_poll")


class FieldPoller(asyncio.DatagramProtocol):
    POLL_INTERVAL = 1.0   # seconds between field poll cycles
    STARTUP_DELAY = 2.0   # let the gateway bind before first poll
    REPLY_TIMEOUT = 0.5

    def __init__(self, host: str = "127.0.0.1", port: int = 5025):
        self.host = host
        self.port = port
        self.running = False
        self.transport = None
        self._waiter: asyncio.Future | None = None

    def connection_made(self, transport):
        self.transport = transport

    def datagram_received(self, data, addr):
        if self._waiter and not self._waiter.done():
            self._waiter.set_result(data)

    def error_received(self, exc):
        pass

    async def start(self):
        """Poll the serial gateway on an interval with genuine UDP datagrams."""
        self.running = True
        await asyncio.sleep(self.STARTUP_DELAY)
        loop = asyncio.get_event_loop()
        self.transport, _ = await loop.create_datagram_endpoint(
            lambda: self, remote_addr=(self.host, self.port)
        )
        logger.info(
            f"Field poller querying serial gateway at {self.host}:{self.port} "
            f"every {self.POLL_INTERVAL}s (cleartext UDP, no auth)"
        )

        while self.running:
            self._waiter = loop.create_future()
            self.transport.sendto(b"\x01\x03READ_STATUS")
            try:
                await asyncio.wait_for(self._waiter, timeout=self.REPLY_TIMEOUT)
            except asyncio.TimeoutError:
                logger.debug("Field poll timed out — gateway unresponsive")
            await asyncio.sleep(self.POLL_INTERVAL)

    def stop(self):
        self.running = False
        if self.transport:
            self.transport.close()