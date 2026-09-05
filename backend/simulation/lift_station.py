"""
Wastewater Lift Station Simulation -- Cedar Creek Lift Station 7

A remote, unmanned sewage pumping station. Sewage flows by gravity into an
underground WET WELL; when the level rises the station PLC starts a pump that
lifts it out through a pressurized force main. When the level drops the pump
stops. The PLC senses the level and commands the pump entirely over a legacy
serial-to-Ethernet gateway (see comms_gateway) -- there is no independent local
control.

The attack (protocol flooding / DoS) never writes a value. It floods the comms
gateway until the PLC can no longer read the level or command the pump. The
control loop goes OPEN LOOP: the pump holds its last state while sewage keeps
flowing in, the wet well fills unchecked, and the station OVERFLOWS -- a raw
sewage spill. Meanwhile the operator HMI, which polls through the same gateway,
freezes on stale data (loss of view). Real precedent: Maroochy Shire, 2000.
"""

import math
import time
import logging

log = logging.getLogger("lift_station")


class LiftStationSimulation:
    # ── Physical constants ──────────────────────────────────────────────
    LEVEL_START   = 75.0    # % wet-well level -> PLC starts the pump
    LEVEL_STOP    = 25.0    # % -> PLC stops the pump
    LEVEL_ALARM   = 90.0    # % high-level alarm
    LEVEL_OVERFLOW = 100.0  # % -> raw sewage spills

    WELL_PCT_PER_L = 1.0 / 35.0   # 35 L of sewage == 1 % of wet-well level
    PUMP_CAPACITY  = 68.0         # L/s a running pump removes
    INFLOW_BASE    = 45.0         # L/s average sewage inflow
    INFLOW_SWING   = 12.0         # L/s diurnal variation

    FORCE_MAIN_NOMINAL = 46.0     # psi when pumping

    def __init__(self):
        self.reset()

    def reset(self):
        self.wet_well_level = 48.0
        self.inflow_rate    = self.INFLOW_BASE
        self.outflow_rate   = 0.0
        self.pump_running   = False
        self.pump_command   = False   # last command the PLC latched
        self.manual_override = False  # operator HAND override -- holds until reset
        self.force_main_pressure = 0.0
        self.overflow       = False
        self.spill_volume_l = 0.0
        self.high_level_alarm = False

        # Set by the engine each tick from the comms gateway
        self.field_comms_ok   = True
        self.gateway_pkt_rate = 0
        self.gateway_capacity = 0

        self._was_comms_ok = True
        self._t = 0.0
        self.events: list = []
        self._event("Cedar Creek Lift Station 7 online -- wet well nominal")

    def _event(self, msg: str):
        ts = time.strftime("%H:%M:%S")
        self.events.append(f"[{ts}] {msg}")
        if len(self.events) > 20:
            self.events = self.events[-20:]
        log.info(f"[LIFT] {msg}")

    # ── Manual pump control (operator HMI) -- only works with comms up ───
    # A real HOA (Hand-Off-Auto) selector: once the operator takes HAND
    # control, their command has full authority and the automatic level
    # control stands down -- it does not silently reassert itself at the
    # 75%/25% setpoints. Only a reset returns the station to AUTO.
    def toggle_pump(self):
        if not self.field_comms_ok:
            return  # command cannot reach the field through a saturated gateway
        self.manual_override = True
        self.pump_command = not self.pump_command
        self._event(f"Operator HAND override -- pump {'START' if self.pump_command else 'STOP'}")

    # ── Main tick ─────────────────────────────────────────────────────────
    def tick(self, dt: float):
        self._t += dt

        # Diurnal sewage inflow
        self.inflow_rate = self.INFLOW_BASE + self.INFLOW_SWING * math.sin(self._t / 40.0)
        self.inflow_rate = max(0.0, self.inflow_rate)

        # ── Control loop ────────────────────────────────────────────────
        # The bang-bang level control only runs while the PLC can actually
        # SEE the level and COMMAND the pump -- i.e. while the gateway is up
        # -- AND only while no operator HAND override is in effect.
        if self.field_comms_ok:
            if self._was_comms_ok is False:
                self._event("Field comms restored -- control loop resuming")
            if not self.manual_override:
                if self.wet_well_level >= self.LEVEL_START:
                    if not self.pump_command:
                        self._event(f"Level {self.wet_well_level:.0f}% -- pump START (auto)")
                    self.pump_command = True
                elif self.wet_well_level <= self.LEVEL_STOP:
                    if self.pump_command:
                        self._event(f"Level {self.wet_well_level:.0f}% -- pump STOP (auto)")
                    self.pump_command = False
            self.pump_running = self.pump_command
        else:
            # Gateway flooded: the station controller is starved and can no
            # longer sustain pump control -- the run command/heartbeat never
            # reaches the pump, so the contactor drops out and the pump stops.
            # Sewage keeps flowing in with nothing pumping it out.
            if self._was_comms_ok:
                self._event("FIELD COMMS LOST -- controller starved, pump uncontrolled")
            self.pump_running = False
        self._was_comms_ok = self.field_comms_ok

        # ── Wet-well mass balance ───────────────────────────────────────
        self.outflow_rate = self.PUMP_CAPACITY if self.pump_running else 0.0
        net_l = (self.inflow_rate - self.outflow_rate) * dt
        self.wet_well_level += net_l * self.WELL_PCT_PER_L

        if self.wet_well_level >= self.LEVEL_OVERFLOW:
            self.wet_well_level = self.LEVEL_OVERFLOW
            if not self.overflow:
                self._event("OVERFLOW -- raw sewage spilling from wet well")
            self.overflow = True
            # everything that comes in now spills straight out
            self.spill_volume_l += max(0.0, self.inflow_rate - self.outflow_rate) * dt
        else:
            if self.overflow and self.wet_well_level < self.LEVEL_OVERFLOW - 1.0:
                self._event("Overflow stopped -- wet well drawn back down")
            self.overflow = self.wet_well_level >= self.LEVEL_OVERFLOW
        self.wet_well_level = max(0.0, min(self.LEVEL_OVERFLOW, self.wet_well_level))

        self.high_level_alarm = self.wet_well_level >= self.LEVEL_ALARM

        # Force-main pressure follows the pump
        target_p = self.FORCE_MAIN_NOMINAL if self.pump_running else 0.0
        self.force_main_pressure += (target_p - self.force_main_pressure) * min(1.0, dt / 3.0)

    # ── State serialization ─────────────────────────────────────────────
    def get_state(self) -> dict:
        return {
            "wet_well_level":     round(self.wet_well_level, 1),
            "inflow_rate":        round(self.inflow_rate, 1),
            "outflow_rate":       round(self.outflow_rate, 1),
            "pump_running":       self.pump_running,
            "pump_command":       self.pump_command,
            "manual_override":    self.manual_override,
            "force_main_pressure": round(self.force_main_pressure, 1),
            "overflow":           self.overflow,
            "spill_volume_l":     round(self.spill_volume_l, 0),
            "high_level_alarm":   self.high_level_alarm,

            "field_comms_ok":     self.field_comms_ok,
            "comms_lost":         False,   # engine sets True on the HMI-displayed copy
            "gateway_pkt_rate":   self.gateway_pkt_rate,
            "gateway_capacity":   self.gateway_capacity,

            "events": self.events[-6:],
        }