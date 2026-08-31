"""
Legacy Serial-to-Ethernet Gateway -- Cedar Creek Lift Station 7

Emulates the kind of cheap serial gateway (Moxa NPort / Lantronix style) that
bridges a remote PLC's serial field bus to the SCADA network. These devices
have tiny packet buffers and a low-bandwidth serial back-end, so they fall over
under even modest network load -- exactly the DoS weakness this scenario
teaches.

Protocol: UDP on port 5025. A healthy gateway answers a "poll" with the wet-well
reading. The device measures its own inbound packet rate; once it exceeds the
serial back-end's capacity it is SATURATED -- it can no longer relay field
traffic, so the station PLC goes blind and the operator HMI's polls time out.

INTENTIONALLY VULNERABLE: no rate limiting, no source filtering, no auth.
A UDP flood (hping3 --flood --udp, nping --udp, or a Metasploit UDP flooder)
is enough to take it down.
"""

import asyncio
import time
import logging

log = logging.getLogger("comms_gateway")


class _GatewayProtocol(asyncio.DatagramProtocol):
    def __init__(self, gateway: "CommsGateway"):
        self.gateway = gateway
        self.transport = None

    def connection_made(self, transport):
        self.transport = transport

    def datagram_received(self, data, addr):
        self.gateway._count(time.monotonic())
        # A live serial gateway answers ANY probe with an identity banner (real
        # Moxa NPort / Lantronix devices behave this way -- that is how they get
        # discovered). Once saturated it can no longer respond to anything.
        if not self.gateway.saturated:
            self.transport.sendto(self.gateway.BANNER, addr)


class CommsGateway:
    CAPACITY_PPS = 400          # datagrams/sec the serial back-end can sustain
    WINDOW       = 1.0
    # Identity banner returned to any probe -- how a student fingerprints it
    BANNER = (b"CyberCity Serial Device Server NP-5150 | site=CEDAR-CREEK-LS7 "
              b"| link=Modbus-RTU over serial bridge | fw=1.9 | auth=NONE")

    def __init__(self, host: str = "0.0.0.0", port: int = 5025):
        self.host = host
        self.port = port
        self._pkts: list = []
        self.packet_rate = 0
        self.saturated = False
        self._transport = None

    def reset(self):
        self._pkts.clear()
        self.packet_rate = 0
        self.saturated = False
        log.info("[GATEWAY] counters reset")

    def _count(self, t: float):
        self._pkts.append(t)

    def _recompute(self):
        now = time.monotonic()
        self._pkts[:] = [t for t in self._pkts if now - t < self.WINDOW]
        self.packet_rate = len(self._pkts)
        was = self.saturated
        self.saturated = self.packet_rate > self.CAPACITY_PPS
        if self.saturated and not was:
            log.warning(f"[GATEWAY] SATURATED at {self.packet_rate} pkt/s -- field comms lost")
        elif was and not self.saturated:
            log.info(f"[GATEWAY] recovered ({self.packet_rate} pkt/s) -- field comms restored")

    def status(self) -> dict:
        return {
            "packet_rate": self.packet_rate,
            "capacity": self.CAPACITY_PPS,
            "saturated": self.saturated,
        }

    async def _rate_loop(self):
        while True:
            await asyncio.sleep(0.5)
            self._recompute()

    async def start(self):
        loop = asyncio.get_event_loop()
        self._transport, _ = await loop.create_datagram_endpoint(
            lambda: _GatewayProtocol(self), local_addr=(self.host, self.port)
        )
        log.info(f"[GATEWAY] serial-to-Ethernet gateway on UDP {self.host}:{self.port} "
                 f"(capacity {self.CAPACITY_PPS} pkt/s, auth NONE)")
        await self._rate_loop()