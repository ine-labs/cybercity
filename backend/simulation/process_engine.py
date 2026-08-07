"""
Main process engine that orchestrates all scenario simulations.
Runs the simulation loop and provides a unified state interface.
"""

import asyncio
import math
import time

from simulation.dam import DamSimulation
from simulation.treatment_plant import TreatmentPlantSimulation
from simulation.traffic_intersection import TrafficIntersectionSimulation
from simulation.power_grid import PowerGridSimulation
from simulation.pipeline_compressor import PipelineCompressorSimulation


class ProcessEngine:
    TICK_INTERVAL = 0.5  # seconds between simulation ticks

    def __init__(self):
        self.dam = DamSimulation()
        self.plant = TreatmentPlantSimulation()
        self.traffic = TrafficIntersectionSimulation()
        self.grid = PowerGridSimulation()
        self.pipeline = PipelineCompressorSimulation()
        self.running = False
        self.tick_count = 0
        self.start_time = None

        # Frozen "nominal-looking" snapshot shown to the operator HMI while
        # pipeline telemetry is being spoofed (false-data-injection attack)
        self._pipeline_freeze = None
        self._pipeline_was_spoofed = False

    def reset(self):
        """Reset entire simulation to safe defaults."""
        self.dam.reset()
        self.plant.reset()
        self.traffic.reset()
        self.grid.reset()
        self.pipeline.reset()
        self._pipeline_freeze = None
        self._pipeline_was_spoofed = False
        self.tick_count = 0
        self.start_time = time.time()

    def tick(self):
        """Advance one simulation step."""
        dt = self.TICK_INTERVAL

        # Dam simulation step
        self.dam.tick(dt)

        # Feed dam outflow into treatment plant intake
        self.plant.set_intake_from_dam(self.dam.outflow_rate)

        # Treatment plant simulation step
        self.plant.tick(dt)

        # Traffic intersection simulation step
        self.traffic.tick(dt)

        # Power grid simulation step
        self.grid.tick(dt)

        # Pipeline compressor station simulation step
        self.pipeline.tick(dt)

        self.tick_count += 1

    def get_actual_state(self) -> dict:
        """Get the real (ground truth) system state."""
        return {
            "dam": self.dam.get_state(),
            "plant": self.plant.get_state(),
            "traffic": self.traffic.get_state(),
            "grid": self.grid.get_state(),
            "pipeline": self.pipeline.get_state(),
            "tick": self.tick_count,
            "uptime": round(time.time() - self.start_time, 1) if self.start_time else 0,
        }

    def get_displayed_state(self) -> dict:
        """
        Get the state as displayed to the operator HMI.

        Normally identical to the actual state. But if pipeline telemetry has
        been spoofed (false-data-injection attack via DNP3), the displayed
        pipeline values are frozen at a fabricated "nominal" snapshot while
        the real process continues to deteriorate underneath — the operator
        has no way to see it. This mirrors Stuxnet-style deception and the
        PIPEDREAM/INCONTROLLER toolkit's anti-forensic capability.
        """
        state = self.get_actual_state()
        state["spoofing_active"] = False   # the operator screen never reveals the deception

        pipeline_actual = state["pipeline"]
        if pipeline_actual["telemetry_spoofed"]:
            if not self._pipeline_was_spoofed:
                p = self.pipeline
                self._pipeline_freeze = dict(pipeline_actual)
                self._pipeline_freeze.update({
                    "discharge_pressure":    p.DISCHARGE_NOMINAL,
                    "compressor_rpm":        p.RPM_NOMINAL,
                    "vibration":             p.VIBRATION_NOMINAL,
                    "discharge_temp":        p.TEMP_NOMINAL,
                    "flow_rate":             145.0,
                    "pipe_stress":           0.0,
                    "high_pressure_alarm":   False,
                    "high_vibration_alarm":  False,
                    "overspeed_alarm":       False,
                    "high_temp_alarm":       False,
                    "esd_tripped":           False,
                    "prv_relieving":         False,
                    "ruptured":              False,
                    "failure_mode":          None,
                    "telemetry_spoofed":     False,   # operator screen shows "all clear"
                })
            self._pipeline_was_spoofed = True

            # Tiny cosmetic jitter so the frozen readout still looks "live"
            jitter = math.sin(self.tick_count * 0.3)
            frozen = dict(self._pipeline_freeze)
            frozen["discharge_pressure"] = round(frozen["discharge_pressure"] + jitter * 0.6, 1)
            frozen["compressor_rpm"]     = round(frozen["compressor_rpm"] + jitter * 4, 0)
            frozen["vibration"]          = round(max(0.0, frozen["vibration"] + jitter * 0.05), 2)
            state["pipeline"] = frozen
        else:
            self._pipeline_was_spoofed = False
            self._pipeline_freeze = None

        return state

    async def run_loop(self, on_pre_tick=None, on_tick=None):
        """
        Main simulation loop.
        - on_pre_tick: called BEFORE each tick (reads Modbus attacker writes)
        - on_tick: called AFTER each tick (syncs state to Modbus + WebSocket)
        """
        self.running = True
        self.start_time = time.time()

        while self.running:
            # Read attacker inputs from Modbus before simulation step
            if on_pre_tick:
                await on_pre_tick()

            self.tick()

            if on_tick:
                await on_tick(self.get_displayed_state(), self.get_actual_state())

            await asyncio.sleep(self.TICK_INTERVAL)

    def stop(self):
        """Stop the simulation loop."""
        self.running = False
