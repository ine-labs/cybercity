/**
 * GridControlRoom — HMI Dashboard for Power Grid Substation
 * Shows real-time telemetry, trend charts, and manual control panel
 */

import { useEffect, useRef, useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";
import type { ProcessState } from "../../types/process";

interface Props {
  state: ProcessState;
  sendCommand: (cmd: string, value?: number | boolean) => void;
}

interface TrendPoint {
  t: number;
  freq: number;
  hv: number;
  lv: number;
  tx1: number;
  tx2: number;
  tx1t: number;
  tx2t: number;
  stress: number;
}

const CB_NAMES = [
  "CB1 · Line 1 (Gen)",
  "CB2 · Line 2 (Grid)",
  "CB3 · TX1 Primary",
  "CB4 · TX2 Primary",
  "CB5 · Feeder A (Industrial)",
  "CB6 · Feeder B (Residential)",
  "CB7 · Feeder C (Critical)",
];

function AlarmRow({ label, active, critical = false }: {
  label: string; active: boolean; critical?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between py-1 px-2 rounded text-xs font-mono ${
      active
        ? critical ? "bg-red-900/30 border border-red-700" : "bg-amber-900/20 border border-amber-700/50"
        : "bg-gray-900/30"
    }`}>
      <span className={active ? (critical ? "text-red-300" : "text-amber-300") : "text-gray-600"}>
        {label}
      </span>
      <span className={`text-[10px] font-bold ${
        active ? (critical ? "text-red-400 animate-pulse" : "text-amber-400") : "text-gray-700"
      }`}>
        {active ? "ACTIVE" : "NORMAL"}
      </span>
    </div>
  );
}

export function GridControlRoom({ state, sendCommand }: Props) {
  const grid = state.grid;
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const prevTickRef = useRef(0);
  const [cbInput, setCbInput] = useState<number | null>(null);

  useEffect(() => {
    if (!grid) return;
    if (state.tick < prevTickRef.current) {
      setTrend([]);
    }
    prevTickRef.current = state.tick;

    setTrend(prev => {
      const next = [...prev, {
        t:      state.tick,
        freq:   grid.frequency,
        hv:     grid.hv_voltage / 230 * 100,   // % of nominal
        lv:     grid.lv_voltage / 115 * 100,
        tx1:    grid.tx1_load_pct,
        tx2:    grid.tx2_load_pct,
        tx1t:   grid.tx1_temp,
        tx2t:   grid.tx2_temp,
        stress: grid.grid_stress,
      }];
      return next.length > 80 ? next.slice(-80) : next;
    });
  }, [state.tick]);

  if (!grid) return null;

  const cb = grid.cb_states || new Array(7).fill(true);

  // Status badge
  const statusBadge = grid.blackout
    ? { text: "BLACKOUT", cls: "bg-red-900/80 text-red-200 border-red-600 animate-pulse" }
    : grid.cascade_active
    ? { text: "CASCADE FAILURE", cls: "bg-red-900/80 text-red-200 border-red-600 animate-pulse" }
    : grid.grid_stress > 65
    ? { text: "HIGH STRESS", cls: "bg-amber-900/80 text-amber-200 border-amber-600" }
    : grid.freq_alarm || grid.voltage_alarm
    ? { text: "ALARM ACTIVE", cls: "bg-amber-900/80 text-amber-200 border-amber-600" }
    : { text: "NORMAL OPERATION", cls: "bg-green-900/50 text-green-300 border-green-700" };

  return (
    <div className="min-h-screen bg-gray-950 text-gray-200 font-mono p-3">

      {/* Header */}
      <div className="flex items-center justify-between mb-3 px-1">
        <div>
          <div className="text-sm font-bold text-gray-300">
            COPPERLINE SUBSTATION  ·  SCADA CONTROL ROOM
          </div>
          <div className="text-xs text-gray-600">IEC 60870-5-104  ·  TCP :5022  ·  No Auth</div>
        </div>
        <span className={`px-3 py-1 rounded border text-xs font-bold ${statusBadge.cls}`}>
          {statusBadge.text}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-3">

        {/* ── Col 1: Measurements + CB panel ──────────────────────── */}
        <div className="flex flex-col gap-3">
          {/* Key measurements */}
          <div className="bg-gray-900 rounded-lg border border-gray-800 p-3">
            <div className="text-[10px] text-gray-600 uppercase tracking-widest mb-2">
              Grid Measurements
            </div>
            <div className="space-y-1">
              {[
                { label: "Frequency",      value: `${grid.frequency.toFixed(3)} Hz`,
                  color: grid.frequency < 59.0 ? "text-red-400" : grid.frequency < 59.5 ? "text-amber-400" : "text-green-400" },
                { label: "HV Bus (230kV)", value: `${grid.hv_voltage.toFixed(0)} kV`,
                  color: grid.hv_voltage < 205 ? "text-amber-400" : "text-blue-300" },
                { label: "LV Bus (115kV)", value: `${grid.lv_voltage.toFixed(0)} kV`,
                  color: grid.lv_voltage < 100 && grid.lv_voltage > 0 ? "text-amber-400" : grid.lv_voltage === 0 ? "text-red-400" : "text-blue-300" },
                { label: "Active Power",   value: `${grid.active_power.toFixed(0)} MW`,   color: "text-gray-300" },
                { label: "Reactive Power", value: `${grid.reactive_power.toFixed(0)} MVAR`, color: "text-gray-400" },
                { label: "Power Factor",   value: grid.power_factor.toFixed(3),            color: "text-gray-400" },
                { label: "TX1 Loading",    value: `${grid.tx1_load_pct.toFixed(0)}%`,
                  color: grid.tx1_tripped ? "text-red-400" : grid.tx1_load_pct > 85 ? "text-amber-400" : "text-gray-300" },
                { label: "TX2 Loading",    value: `${grid.tx2_load_pct.toFixed(0)}%`,
                  color: grid.tx2_tripped ? "text-red-400" : grid.tx2_load_pct > 85 ? "text-amber-400" : "text-gray-300" },
                { label: "TX1 Temp",       value: `${grid.tx1_temp.toFixed(0)}°C`,
                  color: grid.tx1_temp > 95 ? "text-red-400" : grid.tx1_temp > 75 ? "text-amber-400" : "text-gray-400" },
                { label: "TX2 Temp",       value: `${grid.tx2_temp.toFixed(0)}°C`,
                  color: grid.tx2_temp > 95 ? "text-red-400" : grid.tx2_temp > 75 ? "text-amber-400" : "text-gray-400" },
                { label: "Grid Stress",    value: `${grid.grid_stress.toFixed(0)}%`,
                  color: grid.grid_stress > 75 ? "text-red-400" : grid.grid_stress > 45 ? "text-amber-400" : "text-green-400" },
              ].map(item => (
                <div key={item.label} className="flex justify-between items-center text-xs border-b border-gray-800/50 py-0.5">
                  <span className="text-gray-500">{item.label}</span>
                  <span className={`font-bold tabular-nums ${item.color}`}>{item.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* CB status panel */}
          <div className="bg-gray-900 rounded-lg border border-gray-800 p-3">
            <div className="text-[10px] text-gray-600 uppercase tracking-widest mb-2">
              Circuit Breakers
            </div>
            <div className="space-y-1">
              {CB_NAMES.map((name, i) => (
                <div key={i} className="flex items-center justify-between text-xs">
                  <span className={`${cb[i] ? "text-gray-400" : "text-red-400"}`}>{name}</span>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-bold ${cb[i] ? "text-green-500" : "text-red-400"}`}>
                      {cb[i] ? "CLOSED" : "OPEN"}
                    </span>
                    <button
                      onClick={() => sendCommand(cb[i] ? "grid_trip_cb" : "grid_close_cb", i)}
                      className={`px-1.5 py-0.5 rounded text-[9px] font-bold border transition-colors ${
                        cb[i]
                          ? "border-red-800 text-red-400 hover:bg-red-900/30"
                          : "border-green-800 text-green-400 hover:bg-green-900/30"
                      }`}
                    >
                      {cb[i] ? "TRIP" : "CLOSE"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Col 2: Trend charts ──────────────────────────────────── */}
        <div className="flex flex-col gap-3">
          {/* Frequency trend */}
          <div className="bg-gray-900 rounded-lg border border-gray-800 p-3">
            <div className="text-[10px] text-gray-600 uppercase tracking-widest mb-2">
              Frequency Trend (Hz)
            </div>
            <ResponsiveContainer width="100%" height={130}>
              <LineChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis dataKey="t" hide />
                <YAxis domain={[55, 62]} tick={{ fontSize: 9, fill: "#6b7280" }}
                  tickFormatter={v => `${v}Hz`} width={38} />
                <ReferenceLine y={60} stroke="#374151" strokeDasharray="4 2" />
                <ReferenceLine y={59.5} stroke="#92400e" strokeDasharray="2 2" strokeWidth={0.8} />
                <ReferenceLine y={58.5} stroke="#7f1d1d" strokeDasharray="2 2" strokeWidth={0.8} />
                <Tooltip contentStyle={{ background: "#111827", border: "1px solid #374151",
                  fontSize: 10, fontFamily: "monospace" }}
                  formatter={(v: number) => [`${v.toFixed(3)} Hz`, "Freq"]} />
                <Line type="monotone" dataKey="freq" stroke="#22c55e"
                  dot={false} strokeWidth={1.5} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Transformer loading trend */}
          <div className="bg-gray-900 rounded-lg border border-gray-800 p-3">
            <div className="text-[10px] text-gray-600 uppercase tracking-widest mb-2">
              Transformer Loading (%)
            </div>
            <ResponsiveContainer width="100%" height={130}>
              <LineChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis dataKey="t" hide />
                <YAxis domain={[0, 150]} tick={{ fontSize: 9, fill: "#6b7280" }}
                  tickFormatter={v => `${v}%`} width={32} />
                <ReferenceLine y={85} stroke="#92400e" strokeDasharray="3 2" strokeWidth={0.8} />
                <ReferenceLine y={100} stroke="#7f1d1d" strokeDasharray="2 2" strokeWidth={0.8} />
                <Tooltip contentStyle={{ background: "#111827", border: "1px solid #374151",
                  fontSize: 10, fontFamily: "monospace" }}
                  formatter={(v: number, name: string) => [`${v.toFixed(0)}%`, name]} />
                <Line type="monotone" dataKey="tx1" stroke="#f59e0b"
                  dot={false} strokeWidth={1.5} isAnimationActive={false} name="TX1" />
                <Line type="monotone" dataKey="tx2" stroke="#60a5fa"
                  dot={false} strokeWidth={1.5} isAnimationActive={false} name="TX2" />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Temperature trend */}
          <div className="bg-gray-900 rounded-lg border border-gray-800 p-3">
            <div className="text-[10px] text-gray-600 uppercase tracking-widest mb-2">
              Transformer Temperature (°C)
            </div>
            <ResponsiveContainer width="100%" height={130}>
              <LineChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis dataKey="t" hide />
                <YAxis domain={[40, 140]} tick={{ fontSize: 9, fill: "#6b7280" }}
                  tickFormatter={v => `${v}°`} width={30} />
                <ReferenceLine y={85} stroke="#92400e" strokeDasharray="3 2" strokeWidth={0.8} />
                <ReferenceLine y={105} stroke="#7f1d1d" strokeDasharray="2 2" strokeWidth={0.8} />
                <Tooltip contentStyle={{ background: "#111827", border: "1px solid #374151",
                  fontSize: 10, fontFamily: "monospace" }}
                  formatter={(v: number, name: string) => [`${v.toFixed(0)}°C`, name]} />
                <Line type="monotone" dataKey="tx1t" stroke="#fb923c"
                  dot={false} strokeWidth={1.5} isAnimationActive={false} name="TX1 temp" />
                <Line type="monotone" dataKey="tx2t" stroke="#a78bfa"
                  dot={false} strokeWidth={1.5} isAnimationActive={false} name="TX2 temp" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* ── Col 3: Alarms + Protection controls ──────────────────── */}
        <div className="flex flex-col gap-3">
          {/* Alarms */}
          <div className="bg-gray-900 rounded-lg border border-gray-800 p-3">
            <div className="text-[10px] text-gray-600 uppercase tracking-widest mb-2">
              Alarm Annunciator
            </div>
            <div className="space-y-1">
              <AlarmRow label="BLACKOUT — Total Loss of Supply" active={grid.blackout} critical />
              <AlarmRow label="CASCADE FAILURE Active"          active={grid.cascade_active} critical />
              <AlarmRow label="Frequency Alarm"                  active={grid.freq_alarm} />
              <AlarmRow label="Frequency Trip (UFLS)"            active={grid.freq_trip} critical />
              <AlarmRow label="Voltage Alarm"                     active={grid.voltage_alarm} />
              <AlarmRow label="TX1 Overload Alarm"               active={grid.tx1_overload_alarm} />
              <AlarmRow label="TX2 Overload Alarm"               active={grid.tx2_overload_alarm} />
              <AlarmRow label="TX1 Thermal Trip"                  active={grid.tx1_thermal_trip} critical />
              <AlarmRow label="TX2 Thermal Trip"                  active={grid.tx2_thermal_trip} critical />
              <AlarmRow label="Overcurrent Alarm"                 active={grid.overcurrent_alarm} />
            </div>
          </div>

          {/* Protection relay controls */}
          <div className="bg-gray-900 rounded-lg border border-gray-800 p-3">
            <div className="text-[10px] text-gray-600 uppercase tracking-widest mb-2">
              Protection Relay Control
            </div>
            <div className="space-y-1.5">
              {[
                { label: "Master Protection",     active: grid.protection_enabled,   cmd: "grid_toggle_protection" },
                { label: "Differential (87T)",    active: grid.diff_prot_enabled,    cmd: "grid_toggle_diff_prot" },
                { label: "Overcurrent (51)",       active: grid.overcurrent_enabled,  cmd: "grid_toggle_overcurrent" },
                { label: "Under-Frequency (81L)",  active: grid.underfreq_enabled,    cmd: "grid_toggle_underfreq" },
                { label: "Auto-Recloser (79)",     active: grid.autorecloser_enabled, cmd: "grid_toggle_autorecloser" },
              ].map(item => (
                <div key={item.label} className="flex items-center justify-between text-xs">
                  <span className={item.active ? "text-gray-300" : "text-red-400"}>{item.label}</span>
                  <button
                    onClick={() => sendCommand(item.cmd)}
                    className={`px-2 py-0.5 rounded text-[9px] font-bold border transition-colors ${
                      item.active
                        ? "border-green-800 text-green-400 hover:bg-green-900/20"
                        : "border-red-800 text-red-400 hover:bg-red-900/20 animate-pulse"
                    }`}
                  >
                    {item.active ? "ENABLED" : "DISABLED"}
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* System reset */}
          <div className="bg-gray-900 rounded-lg border border-gray-800 p-3">
            <div className="text-[10px] text-gray-600 uppercase tracking-widest mb-2">
              Grid Operations
            </div>
            <div className="space-y-2">
              <div className="text-[10px] text-gray-500">
                IEC 60870-5-104 Outstation: <span className="text-blue-400">tcp://localhost:5022</span>
              </div>
              <div className="text-[10px] text-gray-500">
                Auth: <span className="text-red-400 font-bold">NONE (vulnerable)</span>
              </div>
              <button
                onClick={() => sendCommand("grid_reset")}
                className="w-full mt-2 py-1.5 px-3 rounded border border-blue-800
                  text-blue-400 text-xs font-bold hover:bg-blue-900/20 transition-colors"
              >
                RESTORE GRID (Reset)
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Event log */}
      <div className="mt-3 bg-gray-900 rounded-lg border border-blue-900/50 p-3">
        <div className="text-[10px] text-blue-600 uppercase tracking-widest mb-2">
          SCADA Event Log
        </div>
        <div className="space-y-0.5 max-h-24 overflow-y-auto">
          {[...(grid.events || [])].reverse().map((evt, i) => (
            <div key={i} className={`text-[10px] font-mono ${
              evt.includes("BLACKOUT") || evt.includes("CATASTROPHIC") ? "text-red-400" :
              evt.includes("TRIP") || evt.includes("CASCADE") ? "text-amber-400" :
              evt.includes("RECOVERY") || evt.includes("CLOSE") ? "text-green-400" :
              "text-gray-500"
            }`}>
              {evt}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
