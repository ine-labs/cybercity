"""
Gas Pipeline Compressor Station Simulation — Redwater Compressor Station

Topology:
  Upstream Pipeline ──[Suction Valve]── SUCTION HEADER (620 psi nominal)
                                                │
                                    ┌───────────┴───────────┐
                                    │   CENTRIFUGAL          │
                                    │   COMPRESSOR            │
                                    │   9,500 RPM nominal     │
                                    └───────────┬───────────┘
                                                │
                              DISCHARGE HEADER (1,420 psi nominal)
                                                │
                 ┌────────────────┬─────────────┴──────┬───────────────┐
              [PRV]          [PRV Block           [Discharge        [Blowdown /
        (mechanical,          Valve]               Valve]             ESD Vent]
         1,540 psi)          ATTACKABLE          to downstream        Valve
                                                    pipeline

Safety layers (defense in depth — mirrors real pipeline SIS design):
  Layer 1 — ESD (Emergency Shutdown System, electronic/SIS):
            Trips the compressor + opens the blowdown valve on high-high
            pressure, overspeed, or high vibration. ATTACKABLE: esd_armed
            can be disabled remotely (mirrors TRISIS/TRITON, 2017).
  Layer 2 — PRV (Pressure Relief Valve, mechanical):
            Physically lifts and vents to atmosphere at 1,540 psi,
            independent of any electronics — UNLESS its isolation valve is
            closed. ATTACKABLE: prv_block_valve_closed (mirrors the
            real-world "blocked-in relief valve" catastrophic-failure
            precedent, e.g. BP Texas City, 2005).

Attack vectors (mirrors PIPEDREAM/INCONTROLLER 2022 + TRISIS/TRITON 2017):
  rpm_setpoint:             Overspeed the compressor — vibration, bearing damage
  esd_armed:                Disable the SIS — no automatic protective trip
  prv_block_valve_closed:   Isolate the mechanical relief valve — last fail-safe gone
  telemetry_spoofed:        False-data-injection — freezes what the HMI/Modbus
                             master reads at "nominal" while the real process
                             deteriorates underneath (mirrors Stuxnet-style deception)
"""

import time
import logging

log = logging.getLogger("pipeline_compressor")


class PipelineCompressorSimulation:
    # ── Physical constants ──────────────────────────────────────────────
    SUCTION_NOMINAL   = 620.0    # psi
    DISCHARGE_NOMINAL = 1420.0   # psi
    MAOP              = 1480.0   # psi — Maximum Allowable Operating Pressure (49 CFR 192)
    ESD_HH_SETPOINT   = 1500.0   # psi — SIS high-high pressure trip (Layer 1, electronic)
    PRV_LIFT_PRESSURE = 1540.0   # psi — mechanical relief valve setpoint (Layer 2)
    RUPTURE_STRESS    = 100.0    # pipe_stress index (0-100) — segment rupture

    RPM_NOMINAL      = 9500.0
    RPM_MAX_SAFE     = 11000.0   # overspeed alarm
    RPM_TRIP         = 11800.0   # ESD overspeed trip (Layer 1)
    RPM_CATASTROPHIC = 13500.0   # mechanical destruction if ESD bypassed

    VIBRATION_NOMINAL = 2.0      # mils (API 670-style bearing vibration)
    VIBRATION_ALARM   = 7.0      # mils
    VIBRATION_TRIP    = 10.0     # mils — ESD trip (Layer 1)

    TEMP_NOMINAL = 145.0   # °F discharge gas temperature
    TEMP_ALARM   = 195.0
    TEMP_TRIP    = 225.0

    PRESSURE_TAU = 22.0   # seconds — first-order lag time constant
    STRESS_TAU   = 35.0   # seconds — pipe fatigue accumulation lag

    def __init__(self):
        self.reset()

    def reset(self):
        self.suction_pressure   = self.SUCTION_NOMINAL
        self.discharge_pressure = self.DISCHARGE_NOMINAL
        self.compressor_rpm     = self.RPM_NOMINAL
        self.rpm_setpoint       = self.RPM_NOMINAL
        self.discharge_temp     = self.TEMP_NOMINAL
        self.vibration          = self.VIBRATION_NOMINAL
        self.flow_rate          = 145.0   # MMSCFD

        # Valves
        self.suction_valve_open   = True
        self.discharge_valve_open = True
        self.blowdown_valve_open  = False

        # Safety layers (ATTACKABLE)
        self.esd_armed              = True
        self.prv_block_valve_closed = False

        # Trip / event states
        self.esd_tripped   = False
        self.prv_relieving = False
        self.ruptured      = False
        self.failure_mode  = None   # "overpressure_rupture" | "compressor_overspeed" | None

        # Structural fatigue (0-100)
        self.pipe_stress = 0.0

        # Alarms
        self.high_pressure_alarm  = False
        self.high_vibration_alarm = False
        self.overspeed_alarm      = False
        self.high_temp_alarm      = False

        # Deception (ATTACKABLE — false data injection)
        self.telemetry_spoofed = False

        self.events: list = []
        self._event("Redwater Compressor Station initialized — all systems nominal")

    # ── Event logging ────────────────────────────────────────────────────
    def _event(self, msg: str):
        ts = time.strftime("%H:%M:%S")
        self.events.append(f"[{ts}] {msg}")
        if len(self.events) > 20:
            self.events = self.events[-20:]
        log.info(f"[PIPELINE] {msg}")

    # ── External setters ─────────────────────────────────────────────────
    def set_rpm_setpoint(self, value: float):
        self.rpm_setpoint = max(0.0, min(20000.0, value))

    # ── Compressor speed dynamics ────────────────────────────────────────
    def _update_compressor(self, dt: float):
        # A trip only holds the compressor down while the SIS that issued it
        # is still armed. Bypassing the ESD removes it from the loop
        # entirely, including any trip it already latched — the compressor
        # becomes controllable again via rpm_setpoint alone.
        held_by_esd = self.esd_armed and self.esd_tripped
        target_rpm = 0.0 if (held_by_esd or self.ruptured) else self.rpm_setpoint
        self.compressor_rpm += (target_rpm - self.compressor_rpm) * min(1.0, dt / 4.0)
        self.compressor_rpm = max(0.0, self.compressor_rpm)

    # ── Pressure & flow dynamics ─────────────────────────────────────────
    def _update_pressure_and_flow(self, dt: float):
        if not self.suction_valve_open:
            self.suction_pressure = max(0.0, self.suction_pressure - 5.0 * dt)
        else:
            self.suction_pressure += (self.SUCTION_NOMINAL - self.suction_pressure) * min(1.0, dt / 10.0)

        speed_ratio = self.compressor_rpm / self.RPM_NOMINAL
        base_ratio  = self.DISCHARGE_NOMINAL / self.SUCTION_NOMINAL
        compression_ratio = 1.0 + (base_ratio - 1.0) * (speed_ratio ** 1.6)

        # Deadhead: compressor spinning against closed outlet — gas has nowhere to go
        deadhead = (not self.discharge_valve_open) and (not self.blowdown_valve_open)
        if deadhead and self.compressor_rpm > 500:
            compression_ratio *= 1.55

        target_discharge = self.suction_pressure * compression_ratio if self.compressor_rpm > 100 \
            else self.suction_pressure

        if self.blowdown_valve_open:
            target_discharge = min(target_discharge, self.SUCTION_NOMINAL * 1.05)
        if self.prv_relieving:
            target_discharge = min(target_discharge, self.PRV_LIFT_PRESSURE * 1.01)

        self.discharge_pressure += (target_discharge - self.discharge_pressure) * min(1.0, dt / self.PRESSURE_TAU)
        self.discharge_pressure = max(0.0, self.discharge_pressure)

        if deadhead or not self.discharge_valve_open:
            target_flow = 0.0
        else:
            target_flow = 145.0 * speed_ratio
        self.flow_rate += (target_flow - self.flow_rate) * min(1.0, dt / 6.0)
        self.flow_rate = max(0.0, self.flow_rate)

    # ── Vibration & temperature ──────────────────────────────────────────
    def _update_vibration_and_temp(self, dt: float):
        overspeed_frac = max(0.0, (self.compressor_rpm - self.RPM_NOMINAL) /
                              (self.RPM_CATASTROPHIC - self.RPM_NOMINAL))
        surge = self.flow_rate < 15.0 and self.compressor_rpm > self.RPM_NOMINAL * 0.6

        target_vibe = self.VIBRATION_NOMINAL + overspeed_frac * 22.0 + (9.0 if surge else 0.0)
        self.vibration += (target_vibe - self.vibration) * min(1.0, dt / 6.0)
        self.vibration = max(0.0, self.vibration)

        ratio = self.discharge_pressure / max(1.0, self.suction_pressure)
        base_ratio = self.DISCHARGE_NOMINAL / self.SUCTION_NOMINAL
        target_temp = self.TEMP_NOMINAL + max(0.0, ratio - base_ratio) * 90.0
        self.discharge_temp += (target_temp - self.discharge_temp) * min(1.0, dt / 15.0)

    # ── Protection logic (defense in depth) ──────────────────────────────
    def _trip_esd(self, reason: str):
        self.esd_tripped = True
        self.blowdown_valve_open = True
        self._event(f"ESD TRIP — {reason} — compressor stopped, blowdown valve opened")

    def _run_protection(self, dt: float):
        self.high_pressure_alarm  = self.discharge_pressure > self.MAOP
        self.high_vibration_alarm = self.vibration > self.VIBRATION_ALARM
        self.overspeed_alarm      = self.compressor_rpm > self.RPM_MAX_SAFE
        self.high_temp_alarm      = self.discharge_temp > self.TEMP_ALARM

        # ── Layer 1 — ESD (electronic SIS) ───────────────────────────────
        if self.esd_armed and not self.esd_tripped:
            if self.discharge_pressure >= self.ESD_HH_SETPOINT:
                self._trip_esd(f"HIGH-HIGH PRESSURE {self.discharge_pressure:.0f} psi")
            elif self.compressor_rpm >= self.RPM_TRIP:
                self._trip_esd(f"OVERSPEED {self.compressor_rpm:.0f} RPM")
            elif self.vibration >= self.VIBRATION_TRIP:
                self._trip_esd(f"HIGH VIBRATION {self.vibration:.1f} mils")

        # ── Layer 2 — PRV (mechanical, independent of ESD/electronics) ──
        if self.discharge_pressure >= self.PRV_LIFT_PRESSURE and not self.prv_block_valve_closed:
            if not self.prv_relieving:
                self._event(f"PRV LIFTED — venting to atmosphere at {self.discharge_pressure:.0f} psi")
            self.prv_relieving = True
        elif self.discharge_pressure < self.PRV_LIFT_PRESSURE * 0.92 and self.prv_relieving:
            self._event("PRV reseated — pressure normalized")
            self.prv_relieving = False

        # ── Pipe structural fatigue ──────────────────────────────────────
        overpressure = max(0.0, self.discharge_pressure - self.MAOP)
        unrelieved    = not self.prv_relieving and not self.blowdown_valve_open
        if overpressure > 0 and unrelieved:
            target_stress = min(100.0, overpressure / 3.0)
            self.pipe_stress += (target_stress - self.pipe_stress) * min(1.0, dt / self.STRESS_TAU)
        else:
            self.pipe_stress += (0.0 - self.pipe_stress) * min(1.0, dt / (self.STRESS_TAU * 1.5))
        self.pipe_stress = max(0.0, min(100.0, self.pipe_stress))

        if self.pipe_stress >= self.RUPTURE_STRESS and not self.ruptured:
            self.ruptured = True
            self.failure_mode = "overpressure_rupture"
            self.blowdown_valve_open = False
            self._event("CATASTROPHIC — pipeline segment RUPTURED. Uncontrolled gas release.")
        elif self.compressor_rpm >= self.RPM_CATASTROPHIC and not self.esd_armed and not self.ruptured:
            self.ruptured = True
            self.failure_mode = "compressor_overspeed"
            self._event(f"CATASTROPHIC — compressor destroyed at {self.compressor_rpm:.0f} RPM (ESD bypassed)")

    # ── Main tick ─────────────────────────────────────────────────────────
    def tick(self, dt: float):
        if self.ruptured:
            # Uncontrolled release — pressure and speed bleed off, nothing recovers without reset
            self.discharge_pressure = max(0.0, self.discharge_pressure - 40.0 * dt)
            self.flow_rate = max(0.0, self.flow_rate - 20.0 * dt)
            self.compressor_rpm = max(0.0, self.compressor_rpm - 500.0 * dt)
            return

        self._update_compressor(dt)
        self._update_pressure_and_flow(dt)
        self._update_vibration_and_temp(dt)
        self._run_protection(dt)

    # ── State serialization ───────────────────────────────────────────────
    def get_state(self) -> dict:
        return {
            "suction_pressure":   round(self.suction_pressure, 1),
            "discharge_pressure": round(self.discharge_pressure, 1),
            "compressor_rpm":     round(self.compressor_rpm, 0),
            "rpm_setpoint":       round(self.rpm_setpoint, 0),
            "discharge_temp":     round(self.discharge_temp, 1),
            "vibration":          round(self.vibration, 2),
            "flow_rate":          round(self.flow_rate, 1),
            "pipe_stress":        round(self.pipe_stress, 1),

            "suction_valve_open":   self.suction_valve_open,
            "discharge_valve_open": self.discharge_valve_open,
            "blowdown_valve_open":  self.blowdown_valve_open,

            "esd_armed":              self.esd_armed,
            "prv_block_valve_closed": self.prv_block_valve_closed,
            "esd_tripped":            self.esd_tripped,
            "prv_relieving":          self.prv_relieving,
            "ruptured":               self.ruptured,
            "failure_mode":           self.failure_mode,

            "high_pressure_alarm":  self.high_pressure_alarm,
            "high_vibration_alarm": self.high_vibration_alarm,
            "overspeed_alarm":      self.overspeed_alarm,
            "high_temp_alarm":      self.high_temp_alarm,

            "telemetry_spoofed": self.telemetry_spoofed,

            "events": self.events[-6:],
        }
