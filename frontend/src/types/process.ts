/** Dam simulation state */
export interface DamState {
  water_level: number;
  inflow_rate: number;
  outflow_rate: number;
  gate_position: number;
  gate_target: number;
  spillway_active: boolean;
  high_level_alarm: boolean;
  low_level_alarm: boolean;
  overflow: boolean;
}

/** Treatment plant stage status: 0=offline, 1=normal, 2=warning, 3=critical */
export type StageStatus = 0 | 1 | 2 | 3;

/** Treatment plant simulation state */
export interface PlantState {
  chlorine_level: number;
  ph_level: number;
  turbidity: number;
  tank_level: number;
  distribution_pressure: number;
  intake_rate: number;
  intake_pump: boolean;
  chemical_pump: boolean;
  distribution_pump: boolean;
  chlorine_dosing_rate: number;
  chemical_alarm: boolean;
  pressure_alarm: boolean;
  turbidity_alarm: boolean;
  stages: Record<string, StageStatus>;
}

/** Traffic intersection simulation state */
export interface TrafficState {
  current_phase: number;
  phase_timer: number;
  ns_green_time: number;
  ew_green_time: number;
  ns_light: "red" | "yellow" | "green";
  ew_light: "red" | "yellow" | "green";
  ns_pedestrian: "walk" | "stop";
  ew_pedestrian: "walk" | "stop";
  ns_queue: number;
  ew_queue: number;
  ns_wait_time: number;
  ew_wait_time: number;
  phase_hold: number;
  preemption_active: number;
  conflict_monitor_enabled: boolean;
  flash_mode: boolean;
  conflict_detected: boolean;
  gridlock_level: number;
  total_vehicles_passed: number;
  cycle_count: number;
}

/** Power Grid Substation state */
export interface GridState {
  // Circuit breakers (7 total: CB1-CB7)
  cb_states: boolean[];

  // Transformers
  tx1_load_pct: number;
  tx2_load_pct: number;
  tx1_temp: number;
  tx2_temp: number;
  tx1_tripped: boolean;
  tx2_tripped: boolean;

  // Bus measurements
  hv_voltage: number;
  lv_voltage: number;
  frequency: number;
  active_power: number;
  reactive_power: number;
  power_factor: number;

  // Topology
  source1_connected: boolean;
  source2_connected: boolean;
  feeder_a_live: boolean;
  feeder_b_live: boolean;
  feeder_c_live: boolean;

  // Protection relays (all attackable)
  protection_enabled: boolean;
  diff_prot_enabled: boolean;
  overcurrent_enabled: boolean;
  underfreq_enabled: boolean;
  autorecloser_enabled: boolean;

  // Alarms
  freq_alarm: boolean;
  freq_trip: boolean;
  voltage_alarm: boolean;
  tx1_overload_alarm: boolean;
  tx2_overload_alarm: boolean;
  tx1_thermal_trip: boolean;
  tx2_thermal_trip: boolean;
  overcurrent_alarm: boolean;
  blackout: boolean;
  cascade_active: boolean;
  grid_stress: number;

  events: string[];
}

/** Pipeline Compressor Station state */
export interface PipelineState {
  suction_pressure: number;
  discharge_pressure: number;
  compressor_rpm: number;
  rpm_setpoint: number;
  discharge_temp: number;
  vibration: number;
  flow_rate: number;
  pipe_stress: number;

  suction_valve_open: boolean;
  discharge_valve_open: boolean;
  blowdown_valve_open: boolean;

  esd_armed: boolean;
  prv_block_valve_closed: boolean;
  esd_tripped: boolean;
  prv_relieving: boolean;
  ruptured: boolean;
  failure_mode: "overpressure_rupture" | "compressor_overspeed" | null;

  high_pressure_alarm: boolean;
  high_vibration_alarm: boolean;
  overspeed_alarm: boolean;
  high_temp_alarm: boolean;

  telemetry_spoofed: boolean;

  events: string[];
}

/** Full process state from backend */
export interface ProcessState {
  dam: DamState;
  plant: PlantState;
  traffic: TrafficState;
  grid: GridState;
  pipeline: PipelineState;
  tick: number;
  uptime: number;
  spoofing_active?: boolean;
}

/** WebSocket update payload */
export interface ProcessUpdate {
  displayed: ProcessState;
  actual: ProcessState;
}

/** Attack phase */
export type AttackPhase = "idle" | "recon" | "eavesdrop" | "register_write";

/** Recon result */
export interface ReconResult {
  phase: string;
  message: string;
  holding_registers: Record<string, {
    name: string;
    unit: string;
    raw_value: number;
    value: number;
  }>;
  coils: Record<string, {
    name: string;
    description: string;
    value: boolean;
  }>;
}
