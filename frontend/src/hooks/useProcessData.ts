import { useState, useEffect } from "react";
import { socket } from "../socket";
import type { ProcessState, ProcessUpdate } from "../types/process";

const DEFAULT_DAM: ProcessState["dam"] = {
  water_level: 50,
  inflow_rate: 120,
  outflow_rate: 120,
  gate_position: 40,
  gate_target: 40,
  spillway_active: false,
  high_level_alarm: false,
  low_level_alarm: false,
  overflow: false,
};

const DEFAULT_PLANT: ProcessState["plant"] = {
  chlorine_level: 2.5,
  ph_level: 7.2,
  turbidity: 1.5,
  tank_level: 60,
  distribution_pressure: 55,
  intake_rate: 120,
  intake_pump: true,
  chemical_pump: true,
  distribution_pump: true,
  chlorine_dosing_rate: 2.5,
  chemical_alarm: false,
  pressure_alarm: false,
  turbidity_alarm: false,
  stages: {
    intake: 1,
    coagulation: 1,
    sedimentation: 1,
    filtration: 1,
    chlorination: 1,
    distribution: 1,
  },
};

const DEFAULT_TRAFFIC: ProcessState["traffic"] = {
  current_phase: 1,
  phase_timer: 30,
  ns_green_time: 30,
  ew_green_time: 30,
  ns_light: "green",
  ew_light: "red",
  ns_pedestrian: "walk",
  ew_pedestrian: "stop",
  ns_queue: 0,
  ew_queue: 0,
  ns_wait_time: 0,
  ew_wait_time: 0,
  phase_hold: 0,
  preemption_active: 0,
  conflict_monitor_enabled: true,
  flash_mode: false,
  conflict_detected: false,
  gridlock_level: 0,
  total_vehicles_passed: 0,
  cycle_count: 0,
};

const DEFAULT_GRID: ProcessState["grid"] = {
  cb_states: [true, true, true, true, true, true, true],
  tx1_load_pct: 38,
  tx2_load_pct: 38,
  tx1_temp: 68,
  tx2_temp: 68,
  tx1_tripped: false,
  tx2_tripped: false,
  hv_voltage: 230,
  lv_voltage: 115,
  frequency: 60,
  active_power: 190,
  reactive_power: 46,
  power_factor: 0.972,
  source1_connected: true,
  source2_connected: true,
  feeder_a_live: true,
  feeder_b_live: true,
  feeder_c_live: true,
  protection_enabled: true,
  diff_prot_enabled: true,
  overcurrent_enabled: true,
  underfreq_enabled: true,
  autorecloser_enabled: true,
  freq_alarm: false,
  freq_trip: false,
  voltage_alarm: false,
  tx1_overload_alarm: false,
  tx2_overload_alarm: false,
  tx1_thermal_trip: false,
  tx2_thermal_trip: false,
  overcurrent_alarm: false,
  blackout: false,
  cascade_active: false,
  grid_stress: 0,
  events: [],
};

const DEFAULT_PIPELINE: ProcessState["pipeline"] = {
  suction_pressure: 620,
  discharge_pressure: 1420,
  compressor_rpm: 9500,
  rpm_setpoint: 9500,
  discharge_temp: 145,
  vibration: 2.0,
  flow_rate: 145,
  pipe_stress: 0,
  suction_valve_open: true,
  discharge_valve_open: true,
  blowdown_valve_open: false,
  esd_armed: true,
  prv_block_valve_closed: false,
  esd_tripped: false,
  prv_relieving: false,
  ruptured: false,
  failure_mode: null,
  high_pressure_alarm: false,
  high_vibration_alarm: false,
  overspeed_alarm: false,
  high_temp_alarm: false,
  telemetry_spoofed: false,
  events: [],
};

const DEFAULT_LIFT: ProcessState["lift"] = {
  wet_well_level: 48,
  inflow_rate: 45,
  outflow_rate: 0,
  pump_running: false,
  pump_command: false,
  manual_override: false,
  force_main_pressure: 0,
  overflow: false,
  spill_volume_l: 0,
  high_level_alarm: false,
  field_comms_ok: true,
  comms_lost: false,
  gateway_pkt_rate: 0,
  gateway_capacity: 400,
  events: [],
};

const DEFAULT_STATE: ProcessState = {
  dam: DEFAULT_DAM,
  plant: DEFAULT_PLANT,
  traffic: DEFAULT_TRAFFIC,
  grid: DEFAULT_GRID,
  pipeline: DEFAULT_PIPELINE,
  lift: DEFAULT_LIFT,
  tick: 0,
  uptime: 0,
};

export function useProcessData() {
  const [displayed, setDisplayed] = useState<ProcessState>(DEFAULT_STATE);
  const [actual, setActual] = useState<ProcessState>(DEFAULT_STATE);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    function onConnect() {
      setConnected(true);
    }

    function onDisconnect() {
      setConnected(false);
    }

    function onProcessUpdate(data: ProcessUpdate) {
      setDisplayed({
        ...DEFAULT_STATE,
        ...data.displayed,
        traffic: { ...DEFAULT_TRAFFIC, ...data.displayed?.traffic },
        grid: { ...DEFAULT_GRID, ...data.displayed?.grid },
        pipeline: { ...DEFAULT_PIPELINE, ...data.displayed?.pipeline },
        lift: { ...DEFAULT_LIFT, ...data.displayed?.lift },
      });
      setActual({
        ...DEFAULT_STATE,
        ...data.actual,
        traffic: { ...DEFAULT_TRAFFIC, ...data.actual?.traffic },
        grid: { ...DEFAULT_GRID, ...data.actual?.grid },
        pipeline: { ...DEFAULT_PIPELINE, ...data.actual?.pipeline },
        lift: { ...DEFAULT_LIFT, ...data.actual?.lift },
      });
    }

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("process_update", onProcessUpdate);

    // Check if already connected
    if (socket.connected) {
      setConnected(true);
    }

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("process_update", onProcessUpdate);
    };
  }, []);

  const sendCommand = (command: string, value?: number | boolean) => {
    socket.emit("manual_control", { command, value });
  };

  return { displayed, actual, connected, sendCommand };
}
