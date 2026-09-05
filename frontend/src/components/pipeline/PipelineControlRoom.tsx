/**
 * PipelineControlRoom — HMI Dashboard for Redwater Compressor Station
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
  discharge: number;
  suction: number;
  rpm: number;
  vibe: number;
  temp: number;
  stress: number;
}

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

export function PipelineControlRoom({ state, sendCommand }: Props) {
  const p = state.pipeline;
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const prevTickRef = useRef(0);
  const [rpmInput, setRpmInput] = useState(9500);

  useEffect(() => {
    if (!p) return;
    if (state.tick < prevTickRef.current) setTrend([]);
    prevTickRef.current = state.tick;

    setTrend(prev => {
      const next = [...prev, {
        t: state.tick,
        discharge: p.discharge_pressure,
        suction: p.suction_pressure,
        rpm: p.compressor_rpm,
        vibe: p.vibration,
        temp: p.discharge_temp,
        stress: p.pipe_stress,
      }];
      return next.length > 80 ? next.slice(-80) : next;
    });
  }, [state.tick]);

  if (!p) return null;

  const statusBadge = p.ruptured
    ? { text: "PIPELINE RUPTURE", cls: "bg-red-900/80 text-red-200 border-red-600 animate-pulse" }
    : p.esd_tripped
    ? { text: "ESD TRIPPED", cls: "bg-amber-900/80 text-amber-200 border-amber-600" }
    : p.pipe_stress > 50
    ? { text: "HIGH PIPE STRESS", cls: "bg-amber-900/80 text-amber-200 border-amber-600" }
    : p.high_pressure_alarm || p.high_vibration_alarm
    ? { text: "ALARM ACTIVE", cls: "bg-amber-900/80 text-amber-200 border-amber-600" }
    : { text: "NORMAL OPERATION", cls: "bg-green-900/50 text-green-300 border-green-700" };

  return (
    <div className="min-h-screen bg-gray-950 text-gray-200 font-mono p-3">
      <div className="flex items-center justify-between mb-3 px-1">
        <div>
          <div className="text-sm font-bold text-gray-300">
            REDWATER COMPRESSOR STATION · SCADA CONTROL ROOM
          </div>
          <div className="text-xs text-gray-600">Modbus/TCP RTU · TCP :5023 · No Authentication</div>
        </div>
        <span className={`px-3 py-1 rounded border text-xs font-bold ${statusBadge.cls}`}>
          {statusBadge.text}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {/* ── Col 1: Measurements + Valve panel ─────────────────────── */}
        <div className="flex flex-col gap-3">
          <div className="bg-gray-900 rounded-lg border border-gray-800 p-3">
            <div className="text-[10px] text-gray-600 uppercase tracking-widest mb-2">
              Process Measurements
            </div>
            <div className="space-y-1">
              {[
                { label: "Suction Pressure",   value: `${p.suction_pressure.toFixed(0)} psi`, color: "text-gray-300" },
                { label: "Discharge Pressure", value: `${p.discharge_pressure.toFixed(0)} psi`,
                  color: p.discharge_pressure > 1540 ? "text-red-400" : p.high_pressure_alarm ? "text-amber-400" : "text-orange-400" },
                { label: "Compressor RPM",      value: `${p.compressor_rpm.toFixed(0)}`,
                  color: p.overspeed_alarm ? "text-amber-400" : "text-gray-300" },
                { label: "RPM Setpoint",        value: `${p.rpm_setpoint.toFixed(0)}`, color: "text-gray-400" },
                { label: "Discharge Temp",      value: `${p.discharge_temp.toFixed(0)} °F`,
                  color: p.high_temp_alarm ? "text-amber-400" : "text-gray-300" },
                { label: "Vibration",           value: `${p.vibration.toFixed(1)} mils`,
                  color: p.vibration > 10 ? "text-red-400" : p.high_vibration_alarm ? "text-amber-400" : "text-gray-300" },
                { label: "Flow Rate",           value: `${p.flow_rate.toFixed(0)} MMSCFD`, color: "text-gray-400" },
                { label: "Pipe Stress",         value: `${p.pipe_stress.toFixed(0)}%`,
                  color: p.pipe_stress > 75 ? "text-red-400" : p.pipe_stress > 40 ? "text-amber-400" : "text-green-400" },
              ].map(item => (
                <div key={item.label} className="flex justify-between items-center text-xs border-b border-gray-800/50 py-0.5">
                  <span className="text-gray-500">{item.label}</span>
                  <span className={`font-bold tabular-nums ${item.color}`}>{item.value}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-gray-900 rounded-lg border border-gray-800 p-3">
            <div className="text-[10px] text-gray-600 uppercase tracking-widest mb-2">
              Valve Control
            </div>
            <div className="space-y-1.5">
              {[
                { label: "Suction Valve",   open: p.suction_valve_open,   cmd: "pipeline_toggle_suction_valve" },
                { label: "Discharge Valve", open: p.discharge_valve_open, cmd: "pipeline_toggle_discharge_valve" },
              ].map(v => (
                <div key={v.label} className="flex items-center justify-between text-xs">
                  <span className={v.open ? "text-gray-300" : "text-red-400"}>{v.label}</span>
                  <button
                    onClick={() => sendCommand(v.cmd)}
                    className={`px-2 py-0.5 rounded text-[9px] font-bold border transition-colors ${
                      v.open ? "border-green-800 text-green-400 hover:bg-green-900/20"
                             : "border-red-800 text-red-400 hover:bg-red-900/20"
                    }`}
                  >
                    {v.open ? "OPEN" : "CLOSED"}
                  </button>
                </div>
              ))}
              <div className="flex items-center justify-between text-xs">
                <span className={p.blowdown_valve_open ? "text-amber-300" : "text-gray-300"}>Blowdown / Vent</span>
                <button
                  onClick={() => sendCommand("pipeline_set_blowdown_valve", !p.blowdown_valve_open)}
                  className={`px-2 py-0.5 rounded text-[9px] font-bold border transition-colors ${
                    p.blowdown_valve_open ? "border-amber-700 text-amber-400 hover:bg-amber-900/20"
                                          : "border-gray-700 text-gray-400 hover:bg-gray-800"
                  }`}
                >
                  {p.blowdown_valve_open ? "OPEN" : "CLOSED"}
                </button>
              </div>
            </div>

            <div className="mt-3 pt-2 border-t border-gray-800">
              <div className="text-[10px] text-gray-600 mb-1">Compressor Speed Setpoint (RPM)</div>
              <div className="flex gap-2 items-center">
                <input
                  type="range" min={0} max={14000} step={100} value={rpmInput}
                  onChange={e => setRpmInput(Number(e.target.value))}
                  onMouseUp={() => sendCommand("pipeline_set_rpm", rpmInput)}
                  onTouchEnd={() => sendCommand("pipeline_set_rpm", rpmInput)}
                  className="flex-1"
                />
                <span className="text-xs tabular-nums w-14 text-right">{rpmInput}</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Col 2: Trend charts ────────────────────────────────────── */}
        <div className="flex flex-col gap-3">
          <div className="bg-gray-900 rounded-lg border border-gray-800 p-3">
            <div className="text-[10px] text-gray-600 uppercase tracking-widest mb-2">
              Discharge Pressure (psi)
            </div>
            <ResponsiveContainer width="100%" height={130}>
              <LineChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis dataKey="t" hide />
                <YAxis domain={[0, 1900]} tick={{ fontSize: 9, fill: "#6b7280" }}
                  tickFormatter={v => `${v}`} width={38} />
                <ReferenceLine y={1480} stroke="#374151" strokeDasharray="4 2" />
                <ReferenceLine y={1500} stroke="#92400e" strokeDasharray="2 2" strokeWidth={0.8} />
                <ReferenceLine y={1540} stroke="#7f1d1d" strokeDasharray="2 2" strokeWidth={0.8} />
                <Tooltip contentStyle={{ background: "#111827", border: "1px solid #374151", fontSize: 10, fontFamily: "monospace" }}
                  formatter={(v: number) => [`${v.toFixed(0)} psi`, "Discharge"]} />
                <Line type="monotone" dataKey="discharge" stroke="#fb923c" dot={false} strokeWidth={1.5} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-gray-900 rounded-lg border border-gray-800 p-3">
            <div className="text-[10px] text-gray-600 uppercase tracking-widest mb-2">
              Compressor Speed (RPM)
            </div>
            <ResponsiveContainer width="100%" height={130}>
              <LineChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis dataKey="t" hide />
                <YAxis domain={[0, 15000]} tick={{ fontSize: 9, fill: "#6b7280" }} width={38} />
                <ReferenceLine y={11000} stroke="#92400e" strokeDasharray="3 2" strokeWidth={0.8} />
                <ReferenceLine y={11800} stroke="#7f1d1d" strokeDasharray="2 2" strokeWidth={0.8} />
                <Tooltip contentStyle={{ background: "#111827", border: "1px solid #374151", fontSize: 10, fontFamily: "monospace" }}
                  formatter={(v: number) => [`${v.toFixed(0)} RPM`, "Speed"]} />
                <Line type="monotone" dataKey="rpm" stroke="#60a5fa" dot={false} strokeWidth={1.5} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-gray-900 rounded-lg border border-gray-800 p-3">
            <div className="text-[10px] text-gray-600 uppercase tracking-widest mb-2">
              Vibration (mils) / Pipe Stress (%)
            </div>
            <ResponsiveContainer width="100%" height={130}>
              <LineChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis dataKey="t" hide />
                <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: "#6b7280" }} width={30} />
                <ReferenceLine y={10} stroke="#7f1d1d" strokeDasharray="2 2" strokeWidth={0.8} />
                <Tooltip contentStyle={{ background: "#111827", border: "1px solid #374151", fontSize: 10, fontFamily: "monospace" }}
                  formatter={(v: number, name: string) => [v.toFixed(1), name]} />
                <Line type="monotone" dataKey="vibe" stroke="#a78bfa" dot={false} strokeWidth={1.5} isAnimationActive={false} name="Vibration" />
                <Line type="monotone" dataKey="stress" stroke="#f87171" dot={false} strokeWidth={1.5} isAnimationActive={false} name="Pipe Stress" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* ── Col 3: Alarms + Safety layer controls ────────────────────── */}
        <div className="flex flex-col gap-3">
          <div className="bg-gray-900 rounded-lg border border-gray-800 p-3">
            <div className="text-[10px] text-gray-600 uppercase tracking-widest mb-2">
              Alarm Annunciator
            </div>
            <div className="space-y-1">
              <AlarmRow label="PIPELINE RUPTURE"       active={p.ruptured} critical />
              <AlarmRow label="ESD Tripped"            active={p.esd_tripped} critical />
              <AlarmRow label="High-High Pressure"     active={p.discharge_pressure >= 1500} critical />
              <AlarmRow label="High Pressure Alarm"    active={p.high_pressure_alarm} />
              <AlarmRow label="PRV Relieving"          active={p.prv_relieving} />
              <AlarmRow label="High Vibration"         active={p.high_vibration_alarm} />
              <AlarmRow label="Overspeed Alarm"        active={p.overspeed_alarm} />
              <AlarmRow label="High Discharge Temp"    active={p.high_temp_alarm} />
            </div>
          </div>

          <div className="bg-gray-900 rounded-lg border border-gray-800 p-3">
            <div className="text-[10px] text-gray-600 uppercase tracking-widest mb-2">
              Safety Layer Control
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className={p.esd_armed ? "text-gray-300" : "text-red-400"}>ESD / SIS (Layer 1)</span>
                <button
                  onClick={() => sendCommand("pipeline_toggle_esd_armed")}
                  className={`px-2 py-0.5 rounded text-[9px] font-bold border transition-colors ${
                    p.esd_armed ? "border-green-800 text-green-400 hover:bg-green-900/20"
                                : "border-red-800 text-red-400 hover:bg-red-900/20 animate-pulse"
                  }`}
                >
                  {p.esd_armed ? "ARMED" : "BYPASSED"}
                </button>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className={!p.prv_block_valve_closed ? "text-gray-300" : "text-red-400"}>PRV Isolation (Layer 2)</span>
                <button
                  onClick={() => sendCommand("pipeline_toggle_prv_block")}
                  className={`px-2 py-0.5 rounded text-[9px] font-bold border transition-colors ${
                    !p.prv_block_valve_closed ? "border-green-800 text-green-400 hover:bg-green-900/20"
                                              : "border-red-800 text-red-400 hover:bg-red-900/20 animate-pulse"
                  }`}
                >
                  {p.prv_block_valve_closed ? "BLOCKED" : "CLEAR"}
                </button>
              </div>
            </div>
          </div>

          <div className="bg-gray-900 rounded-lg border border-gray-800 p-3">
            <div className="text-[10px] text-gray-600 uppercase tracking-widest mb-2">
              Station Operations
            </div>
            <div className="space-y-2">
              <div className="text-[10px] text-gray-500">
                Modbus RTU: <span className="text-orange-400">tcp://localhost:5023</span>
              </div>
              <div className="text-[10px] text-gray-500">
                Auth: <span className="text-red-400 font-bold">NONE (vulnerable)</span>
              </div>
              <button
                onClick={() => sendCommand("pipeline_reset")}
                className="w-full mt-2 py-1.5 px-3 rounded border border-blue-800
                  text-blue-400 text-xs font-bold hover:bg-blue-900/20 transition-colors"
              >
                RESTORE STATION (Reset)
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-3 bg-gray-900 rounded-lg border border-orange-900/50 p-3">
        <div className="text-[10px] text-orange-700 uppercase tracking-widest mb-2">
          SCADA Event Log
        </div>
        <div className="space-y-0.5 max-h-24 overflow-y-auto">
          {[...(p.events || [])].reverse().map((evt, i) => (
            <div key={i} className={`text-[10px] font-mono ${
              evt.includes("CATASTROPHIC") || evt.includes("RUPTURE") ? "text-red-400" :
              evt.includes("TRIP") || evt.includes("LIFTED") ? "text-amber-400" :
              evt.includes("reseated") || evt.includes("normalized") ? "text-green-400" :
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
