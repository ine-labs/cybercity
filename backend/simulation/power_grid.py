"""
Power Grid Substation Simulation — Copperline 230/115kV Regional Substation

Topology:
  Source1 (Gen)  ─── CB1 ──┐
                             ├── [230kV Bus A]
  Source2 (Grid) ─── CB2 ──┘
                             │
                    ┌────────┴────────┐
                 CB3 (T1)          CB4 (T2)
                    │                 │
               [TX1 300MVA]      [TX2 200MVA]
                    │                 │
                    └────────┬────────┘
                        [115kV Bus B]
                             │
               ┌─────────────┼─────────────┐
            CB5 (A)       CB6 (B)        CB7 (C)
               │              │              │
         [Industrial]   [Residential]  [Critical/Hospital]
           80 MW            65 MW           45 MW

Total load: 190 MW | Generation headroom: 300 MW

Attack vectors (mirrors Ukraine 2015/2016 + Industroyer/Crashoverride):
  CB1/CB2:   Trip generation sources → frequency collapse
  CB3/CB4:   Trip transformers → cascade overload
  CB5-CB7:   Trip feeders → selective load shedding
  PROT1.Beh: Disable master protection → no safe failsafe
  RREC1.Beh: Disable auto-recloser → permanent post-trip blackout
  DFPT1.Beh: Disable differential transformer protection
  OCPT1.Beh: Disable overcurrent protection
  UFPT1.Beh: Disable under-frequency load shedding
"""

import math
import logging
import time
from typing import List

log = logging.getLogger("power_grid")


class PowerGridSimulation:
    # ── Physical constants ───────────────────────────────────────────────
    NOMINAL_FREQ   = 60.0    # Hz (NERC North America standard)
    NOMINAL_HV     = 230.0   # kV (transmission bus)
    NOMINAL_LV     = 115.0   # kV (distribution bus)
    TX1_RATING     = 300.0   # MVA (main transformer)
    TX2_RATING     = 200.0   # MVA (backup transformer — undersized by design)
    FEEDER_A_LOAD  = 80.0    # MW Industrial zone
    FEEDER_B_LOAD  = 65.0    # MW Residential zone
    FEEDER_C_LOAD  = 45.0    # MW Critical (hospital / emergency)
    TOTAL_LOAD     = 190.0   # MW
    GEN1_CAPACITY  = 165.0   # MW Line 1 generation
    GEN2_CAPACITY  = 135.0   # MW Line 2 grid interconnect
    NUM_CBS        = 7

    # Transformer thermal model
    TX_AMBIENT     = 40.0    # °C ambient temperature
    TX_THERMAL_TAU = 90.0    # seconds (first-order lag time constant, ~1.5 min for drama)
    TX_NORMAL_TEMP = 68.0    # °C at nominal loading
    TX_WARN_TEMP   = 85.0    # °C alarm
    TX_TRIP_TEMP   = 105.0   # °C thermal trip (with protection)
    TX_FAIL_TEMP   = 130.0   # °C catastrophic failure (no protection)
    TX_NORMAL_LOAD = 38.0    # % — normal operating point

    # Protection thresholds
    OVERCURRENT_ALARM = 85.0  # % loading
    OVERCURRENT_TRIP  = 100.0 # % loading (with protection enabled)
    UNDERFREQ_ALARM   = 59.5  # Hz
    UNDERFREQ_TRIP    = 58.5  # Hz (load-shed relay kicks in)
    OVERFREQ_ALARM    = 60.5  # Hz
    OVERFREQ_TRIP     = 61.5  # Hz
    UNDERVOLT_PU      = 0.88  # pu — under-voltage alarm

    def __init__(self):
        self.reset()

    def reset(self):
        # ── Circuit breaker states ───────────────────────────────────────
        # Index: 0=CB1, 1=CB2, 2=CB3(TX1 HV), 3=CB4(TX2 HV),
        #        4=CB5(Feeder A), 5=CB6(Feeder B), 6=CB7(Feeder C)
        self.cb_closed: List[bool] = [True] * self.NUM_CBS

        # ── Transformer states ───────────────────────────────────────────
        self.tx1_tripped    = False
        self.tx2_tripped    = False
        self.tx1_load_pct   = self.TX_NORMAL_LOAD   # %
        self.tx2_load_pct   = self.TX_NORMAL_LOAD   # %
        self.tx1_temp       = self.TX_NORMAL_TEMP    # °C
        self.tx2_temp       = self.TX_NORMAL_TEMP    # °C

        # ── Bus measurements ─────────────────────────────────────────────
        self.hv_voltage     = self.NOMINAL_HV   # kV
        self.lv_voltage     = self.NOMINAL_LV   # kV
        self.frequency      = self.NOMINAL_FREQ  # Hz
        self.active_power   = self.TOTAL_LOAD    # MW delivered
        self.reactive_power = 46.0               # MVAR
        self.power_factor   = 0.972

        # ── Feeder / source connectivity ─────────────────────────────────
        self.source1_connected  = True
        self.source2_connected  = True
        self.feeder_a_live      = True
        self.feeder_b_live      = True
        self.feeder_c_live      = True

        # ── Protection relay enables (ATTACKABLE) ────────────────────────
        self.protection_enabled   = True    # master switch
        self.diff_prot_enabled    = True    # 87T differential (transformer)
        self.overcurrent_enabled  = True    # 51 overcurrent relay
        self.underfreq_enabled    = True    # 81L under-frequency relay
        self.autorecloser_enabled = True    # 79 auto-recloser

        # ── Alarm / trip flags ───────────────────────────────────────────
        self.freq_alarm            = False
        self.freq_trip             = False
        self.voltage_alarm         = False
        self.tx1_overload_alarm    = False
        self.tx2_overload_alarm    = False
        self.tx1_thermal_trip      = False
        self.tx2_thermal_trip      = False
        self.overcurrent_alarm     = False
        self.blackout              = False
        self.cascade_active        = False

        # ── Grid stress index 0–100 ──────────────────────────────────────
        self.grid_stress = 0.0

        # ── Recent events log ────────────────────────────────────────────
        self.events: List[str] = []

        # ── Internal state ───────────────────────────────────────────────
        self._noise_phase  = 0.0
        self._restore_hold = 0.0

        self._event("Substation initialized — all systems nominal")

    # ── Event logging ─────────────────────────────────────────────────
    def _event(self, msg: str):
        ts = time.strftime("%H:%M:%S")
        entry = f"[{ts}] {msg}"
        self.events.append(entry)
        if len(self.events) > 20:
            self.events = self.events[-20:]
        log.info(f"[GRID] {msg}")

    # ── Circuit breaker control (called by IEC 104 outstation) ────────
    def trip_cb(self, idx: int, reason: str = "remote") -> bool:
        """Open circuit breaker idx (0-indexed). Returns True if state changed."""
        if 0 <= idx < self.NUM_CBS and self.cb_closed[idx]:
            self.cb_closed[idx] = False
            self._event(f"TRIP  CB{idx+1} opened  [{reason}]")
            return True
        return False

    def close_cb(self, idx: int, reason: str = "remote") -> bool:
        """Close circuit breaker idx (0-indexed). Returns True if state changed."""
        if 0 <= idx < self.NUM_CBS and not self.cb_closed[idx]:
            # If grid is in blackout and auto-recloser is disabled, block reconnection
            if self.blackout and not self.autorecloser_enabled and reason == "auto":
                return False
            self.cb_closed[idx] = True
            self._event(f"CLOSE CB{idx+1} closed  [{reason}]")
            return True
        return False

    # ── Power flow computation ─────────────────────────────────────────
    def _compute_power_flow(self) -> float:
        """Return available generation given CB states."""
        self.source1_connected = self.cb_closed[0]   # CB1
        self.source2_connected = self.cb_closed[1]   # CB2

        gen_available = 0.0
        if self.source1_connected:
            gen_available += self.GEN1_CAPACITY
        if self.source2_connected:
            gen_available += self.GEN2_CAPACITY

        # Transformer availability
        tx1_ok = self.cb_closed[2] and not self.tx1_tripped   # CB3 + TX1 healthy
        tx2_ok = self.cb_closed[3] and not self.tx2_tripped   # CB4 + TX2 healthy
        path_to_lv = (tx1_ok or tx2_ok) and (self.source1_connected or self.source2_connected)

        # Feeder load shed
        load_a = self.FEEDER_A_LOAD if self.cb_closed[4] else 0.0  # CB5
        load_b = self.FEEDER_B_LOAD if self.cb_closed[5] else 0.0  # CB6
        load_c = self.FEEDER_C_LOAD if self.cb_closed[6] else 0.0  # CB7
        self.active_power = load_a + load_b + load_c

        # Feeder energized state
        self.feeder_a_live = self.cb_closed[4] and path_to_lv
        self.feeder_b_live = self.cb_closed[5] and path_to_lv
        self.feeder_c_live = self.cb_closed[6] and path_to_lv

        # Transformer loading (parallel operation — proportional to rating)
        if tx1_ok and tx2_ok:
            tx1_share = self.TX1_RATING / (self.TX1_RATING + self.TX2_RATING)  # 60%
            tx2_share = self.TX2_RATING / (self.TX1_RATING + self.TX2_RATING)  # 40%
            tx1_mw = self.active_power * tx1_share
            tx2_mw = self.active_power * tx2_share
        elif tx1_ok:
            tx1_mw = self.active_power
            tx2_mw = 0.0
        elif tx2_ok:
            tx1_mw = 0.0
            tx2_mw = self.active_power
        else:
            tx1_mw = tx2_mw = 0.0

        self.tx1_load_pct = (tx1_mw / self.TX1_RATING) * 100.0
        self.tx2_load_pct = (tx2_mw / self.TX2_RATING) * 100.0

        return gen_available

    # ── Frequency dynamics (simplified ROCOF model) ────────────────────
    def _update_frequency(self, gen: float, dt: float):
        if self.blackout:
            # Frequency decays naturally once grid is black
            self.frequency = max(0.0, self.frequency - 1.8 * dt)
            return

        # Net generation is gen_available minus load; at nominal we have ~110 MW headroom
        # We use the deviation from headroom to drive freq change
        nominal_headroom = (self.GEN1_CAPACITY + self.GEN2_CAPACITY) - self.TOTAL_LOAD
        net_imbalance = (gen - self.active_power) - nominal_headroom

        if gen <= 0.0:
            # No generation → frequency collapses
            self.frequency = max(0.0, self.frequency - 2.5 * dt)
        else:
            # ROCOF ≈ imbalance / inertia_factor (simplified swing eq.)
            self.frequency += (net_imbalance / 400.0) * dt

        # Damping toward 60 Hz when close to nominal
        if abs(net_imbalance) < 30.0:
            self.frequency += (self.NOMINAL_FREQ - self.frequency) * 0.15 * dt

        self.frequency = max(0.0, min(65.0, self.frequency))

    # ── Bus voltage ────────────────────────────────────────────────────
    def _update_voltages(self):
        src_ok = self.source1_connected or self.source2_connected
        tx1_ok = self.cb_closed[2] and not self.tx1_tripped
        tx2_ok = self.cb_closed[3] and not self.tx2_tripped
        any_tx = tx1_ok or tx2_ok

        if not src_ok:
            self.hv_voltage = 0.0
            self.lv_voltage = 0.0
            return

        # Small droop proportional to combined transformer loading
        load_pu = max(self.tx1_load_pct, self.tx2_load_pct) / 100.0
        self.hv_voltage = self.NOMINAL_HV * (1.0 - 0.025 * load_pu)
        self.lv_voltage = self.NOMINAL_LV * (1.0 - 0.035 * load_pu) if any_tx else 0.0

        # Frequency-dependent voltage (under-speed → under-voltage)
        if self.frequency > 0:
            freq_pu = self.frequency / self.NOMINAL_FREQ
            self.hv_voltage *= max(0.0, freq_pu)
            if any_tx:
                self.lv_voltage *= max(0.0, freq_pu)

    # ── Transformer thermal model ──────────────────────────────────────
    def _update_thermal(self, dt: float):
        for i, (load_pct, is_tripped) in enumerate([
            (self.tx1_load_pct, self.tx1_tripped),
            (self.tx2_load_pct, self.tx2_tripped),
        ]):
            temp_attr  = "tx1_temp" if i == 0 else "tx2_temp"
            trip_attr  = "tx1_tripped" if i == 0 else "tx2_tripped"
            tx_name    = f"TX{i+1}"
            curr_temp  = getattr(self, temp_attr)

            if is_tripped or load_pct < 1.0:
                target = self.TX_AMBIENT   # cooling down
            else:
                # Temperature ∝ load² (copper loss dominates); calibrated so
                # TX_NORMAL_LOAD → TX_NORMAL_TEMP
                ratio = (load_pct / self.TX_NORMAL_LOAD) ** 1.6
                target = self.TX_AMBIENT + (self.TX_NORMAL_TEMP - self.TX_AMBIENT) * ratio

            # First-order lag
            new_temp = curr_temp + (target - curr_temp) * (dt / self.TX_THERMAL_TAU)
            setattr(self, temp_attr, new_temp)

            # Thermal protection
            if not is_tripped:
                # With protection enabled
                if new_temp >= self.TX_TRIP_TEMP and (self.diff_prot_enabled or self.protection_enabled):
                    setattr(self, trip_attr, True)
                    self.cb_closed[2 + i] = False   # trip associated HV breaker
                    self._event(f"THERMAL TRIP  {tx_name} tripped at {new_temp:.0f}°C (protection active)")
                # Without protection — catastrophic failure
                elif new_temp >= self.TX_FAIL_TEMP and not self.protection_enabled:
                    setattr(self, trip_attr, True)
                    self.cb_closed[2 + i] = False
                    self._event(f"CATASTROPHIC  {tx_name} DESTROYED at {new_temp:.0f}°C — protection was DISABLED!")

    # ── Protection relay logic ─────────────────────────────────────────
    def _run_protection(self):
        prot = self.protection_enabled   # master enable

        # Overcurrent (transformer loading)
        self.overcurrent_alarm = self.tx1_load_pct > self.OVERCURRENT_ALARM or \
                                  self.tx2_load_pct > self.OVERCURRENT_ALARM

        if prot and self.overcurrent_enabled:
            for i, load_pct in enumerate([self.tx1_load_pct, self.tx2_load_pct]):
                trip_attr = "tx1_tripped" if i == 0 else "tx2_tripped"
                if load_pct > self.OVERCURRENT_TRIP and not getattr(self, trip_attr):
                    setattr(self, trip_attr, True)
                    self.cb_closed[2 + i] = False
                    self._event(f"OVERCURRENT  TX{i+1} tripped at {load_pct:.0f}% load (51 relay)")

        # Under-frequency load shedding
        self.freq_alarm = 0 < self.frequency < self.UNDERFREQ_ALARM or \
                          self.frequency > self.OVERFREQ_ALARM
        self.freq_trip  = 0 < self.frequency < self.UNDERFREQ_TRIP

        if prot and self.underfreq_enabled and self.freq_trip:
            # Shed industrial load first (largest, non-critical), then residential
            if self.cb_closed[4]:
                self.cb_closed[4] = False
                self._event(f"UFLS  Feeder A shed at {self.frequency:.2f} Hz (81L relay)")
            elif self.cb_closed[5]:
                self.cb_closed[5] = False
                self._event(f"UFLS  Feeder B shed at {self.frequency:.2f} Hz (81L relay)")

        # Voltage alarm
        hv_pu = self.hv_voltage / self.NOMINAL_HV if self.NOMINAL_HV else 0
        self.voltage_alarm = (hv_pu < self.UNDERVOLT_PU and self.hv_voltage > 0)

        # Transformer overload alarms
        self.tx1_overload_alarm = self.tx1_load_pct > self.OVERCURRENT_ALARM and not self.tx1_tripped
        self.tx2_overload_alarm = self.tx2_load_pct > self.OVERCURRENT_ALARM and not self.tx2_tripped
        self.tx1_thermal_trip   = self.tx1_tripped
        self.tx2_thermal_trip   = self.tx2_tripped

    # ── Grid stress and blackout detection ────────────────────────────
    def _compute_stress_and_blackout(self):
        # Stress factors
        freq_dev = abs(self.frequency - self.NOMINAL_FREQ) / 2.5 if self.frequency > 0 else 1.0
        tx_load  = max(self.tx1_load_pct, self.tx2_load_pct) / 100.0
        tripped  = sum(1 for c in self.cb_closed if not c) / self.NUM_CBS
        no_prot  = 0.25 if not self.protection_enabled else 0.0

        self.grid_stress = min(100.0,
            min(1.0, freq_dev) * 30 +
            min(1.0, tx_load)  * 20 +
            tripped             * 25 +
            no_prot             * 25
        )

        # Blackout conditions
        src_ok = self.source1_connected or self.source2_connected
        tx_ok  = (self.cb_closed[2] and not self.tx1_tripped) or \
                 (self.cb_closed[3] and not self.tx2_tripped)
        freq_ok = self.frequency >= 55.0

        was_black = self.blackout
        if not freq_ok and self.frequency > 0:
            if not self.blackout:
                self.blackout = True
                self.cascade_active = True
                self._event(f"BLACKOUT  Grid frequency collapsed ({self.frequency:.2f} Hz)")
        elif not src_ok:
            if not self.blackout:
                self.blackout = True
                self.cascade_active = True
                self._event("BLACKOUT  All generation sources disconnected")
        elif not tx_ok:
            if not self.blackout:
                self.blackout = True
                self.cascade_active = True
                self._event("BLACKOUT  All transformers offline — supply lost")
        elif self.blackout and src_ok and tx_ok and self.frequency >= 58.0:
            # Recovery
            self.blackout = False
            self.cascade_active = False
            self._event("RECOVERY  Grid stability restored")

    # ── Main tick ─────────────────────────────────────────────────────
    def tick(self, dt: float):
        self._noise_phase += dt * 0.2
        noise = math.sin(self._noise_phase) * 0.008

        gen = self._compute_power_flow()
        self._update_frequency(gen + noise * 10, dt)
        self._update_voltages()
        self._update_thermal(dt)
        self._run_protection()
        self._compute_stress_and_blackout()

        # Tiny realistic noise on frequency display
        self.frequency += noise * 0.01

    # ── State serialization ───────────────────────────────────────────
    def get_state(self) -> dict:
        return {
            # Circuit breakers
            "cb_states": self.cb_closed.copy(),

            # Transformers
            "tx1_load_pct":  round(self.tx1_load_pct, 1),
            "tx2_load_pct":  round(self.tx2_load_pct, 1),
            "tx1_temp":      round(self.tx1_temp, 1),
            "tx2_temp":      round(self.tx2_temp, 1),
            "tx1_tripped":   self.tx1_tripped,
            "tx2_tripped":   self.tx2_tripped,

            # Bus measurements
            "hv_voltage":    round(self.hv_voltage, 1),
            "lv_voltage":    round(self.lv_voltage, 1),
            "frequency":     round(self.frequency, 3),
            "active_power":  round(self.active_power, 1),
            "reactive_power": round(self.reactive_power, 1),
            "power_factor":  round(self.power_factor, 3),

            # Topology
            "source1_connected": self.source1_connected,
            "source2_connected": self.source2_connected,
            "feeder_a_live":     self.feeder_a_live,
            "feeder_b_live":     self.feeder_b_live,
            "feeder_c_live":     self.feeder_c_live,

            # Protection
            "protection_enabled":   self.protection_enabled,
            "diff_prot_enabled":    self.diff_prot_enabled,
            "overcurrent_enabled":  self.overcurrent_enabled,
            "underfreq_enabled":    self.underfreq_enabled,
            "autorecloser_enabled": self.autorecloser_enabled,

            # Alarms
            "freq_alarm":         self.freq_alarm,
            "freq_trip":          self.freq_trip,
            "voltage_alarm":      self.voltage_alarm,
            "tx1_overload_alarm": self.tx1_overload_alarm,
            "tx2_overload_alarm": self.tx2_overload_alarm,
            "tx1_thermal_trip":   self.tx1_thermal_trip,
            "tx2_thermal_trip":   self.tx2_thermal_trip,
            "overcurrent_alarm":  self.overcurrent_alarm,
            "blackout":           self.blackout,
            "cascade_active":     self.cascade_active,
            "grid_stress":        round(self.grid_stress, 1),

            "events": self.events[-6:],
        }
