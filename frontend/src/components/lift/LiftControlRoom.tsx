/**
 * LiftControlRoom — operator HMI for Cedar Creek Lift Station 7.
 * Consumes DISPLAYED state, so during a gateway flood it shows stale field
 * data with a COMMS LOST alarm — the operator sees the link is down but is
 * blind to the actual wet-well level and can't command the pump.
 */

import { useEffect, useRef, useState } from "react";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, ReferenceLine } from "recharts";
import type { ProcessState } from "../../types/process";

interface Props {
  state: ProcessState;
  sendCommand: (command: string, value?: number | boolean) => void;
}

interface TrendPoint { t: number; level: number; inflow: number }

export function LiftControlRoom({ state, sendCommand }: Props) {
  const l = state.lift;
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const tick = useRef(0);

  useEffect(() => {
    tick.current += 1;
    setTrend(prev => [...prev.slice(-59), { t: tick.current, level: l.wet_well_level, inflow: l.inflow_rate }]);
  }, [l.wet_well_level, l.inflow_rate]);

  const commsLost = l.comms_lost || !l.field_comms_ok;

  const Metric = ({ label, value, unit, alarm }: { label: string; value: string; unit: string; alarm?: boolean }) => (
    <div className={`rounded-lg p-3 border ${alarm ? "border-red-700 bg-red-900/20" : "border-gray-800 bg-gray-900"}`}>
      <div className="text-xs text-gray-400 uppercase tracking-wider font-mono">{label}</div>
      <div className={`text-2xl font-bold font-mono ${alarm ? "text-red-400" : "text-teal-300"}`}>
        {value}<span className="text-sm text-gray-500 ml-1">{unit}</span>
      </div>
    </div>
  );

  const alarms: { label: string; on: boolean }[] = [
    { label: "High Wet-Well Level", on: l.high_level_alarm },
    { label: "Wet-Well Overflow", on: l.overflow },
    { label: "Field Comms Lost", on: commsLost },
  ];

  return (
    <div className="bg-gray-950 text-white p-4">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h1 className="text-xl font-mono font-bold text-teal-400">CONTROL ROOM — LIFT STATION 7 HMI</h1>
          <p className="text-sm font-mono text-gray-500">Cedar Creek Collection System · remote SCADA · serial gateway link</p>
        </div>
        <div className={`px-4 py-2 rounded font-mono text-sm font-bold border ${
          commsLost ? "border-amber-600 text-amber-300 bg-amber-900/20 animate-pulse"
            : l.overflow ? "border-red-600 text-red-300 bg-red-900/20"
            : "border-green-800 text-green-400 bg-green-900/10"
        }`}>
          {commsLost ? "COMMS LOST — DATA STALE" : l.overflow ? "OVERFLOW" : "SYSTEM NORMAL"}
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-5 gap-3 mb-4">
        <Metric label="Wet Well" value={l.wet_well_level.toFixed(0)} unit="%" alarm={l.high_level_alarm || l.overflow} />
        <Metric label="Inflow" value={l.inflow_rate.toFixed(0)} unit="L/s" />
        <Metric label="Pump Outflow" value={l.outflow_rate.toFixed(0)} unit="L/s" />
        <Metric label="Force Main" value={l.force_main_pressure.toFixed(0)} unit="psi" />
        <Metric label="Pump" value={l.pump_running ? "RUN" : "OFF"} unit="" alarm={!l.pump_running && l.wet_well_level > 75} />
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        {/* Wet-well trend */}
        <div className="bg-gray-900 rounded-lg p-3 border border-gray-800">
          <h3 className="text-xs text-gray-400 font-mono mb-2">WET-WELL LEVEL TREND (%)</h3>
          <ResponsiveContainer width="100%" height={130}>
            <LineChart data={trend}>
              <XAxis dataKey="t" hide />
              <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "#6b7280" }} width={30} />
              <ReferenceLine y={90} stroke="#ef4444" strokeDasharray="3 3" />
              <ReferenceLine y={75} stroke="#f59e0b" strokeDasharray="3 3" />
              <Line type="monotone" dataKey="level" stroke="#2dd4bf" dot={false} isAnimationActive={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
          {commsLost && <div className="text-xs font-mono text-amber-400 mt-1">⚠ trend frozen — no field updates</div>}
        </div>

        {/* Field comms status */}
        <div className={`rounded-lg p-3 border ${commsLost ? "border-amber-700 bg-amber-950/30" : "border-gray-800 bg-gray-900"}`}>
          <h3 className="text-xs text-gray-400 font-mono mb-2">FIELD COMMS</h3>
          <div className="flex flex-col items-center justify-center py-2">
            <div className={`text-2xl font-bold font-mono ${commsLost ? "text-amber-400 animate-pulse" : "text-green-400"}`}>
              {commsLost ? "COMM FAIL" : "COMM OK"}
            </div>
            <div className="text-sm font-mono text-gray-500 mt-1">
              {commsLost ? "no response from remote gateway" : "polling normally"}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {/* Alarm panel */}
        <div className="bg-gray-900 rounded-lg p-3 border border-gray-800">
          <h3 className="text-xs text-gray-400 font-mono mb-3">ALARM PANEL</h3>
          <div className="space-y-2">
            {alarms.map(a => (
              <div key={a.label} className={`flex items-center gap-2 text-xs font-mono px-2 py-1 rounded ${a.on ? "bg-red-900/50 text-red-300" : "text-gray-600"}`}>
                <div className={`w-2 h-2 rounded-full ${a.on ? "bg-red-500 animate-pulse" : "bg-gray-700"}`} />
                {a.label}
              </div>
            ))}
          </div>
        </div>

        {/* Manual controls */}
        <div className="bg-gray-900 rounded-lg p-3 border border-gray-800 col-span-2">
          <div className="flex items-center gap-2 mb-3">
            <h3 className="text-xs text-gray-400 font-mono">MANUAL CONTROLS</h3>
            <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
              l.manual_override ? "border-amber-700 text-amber-300 bg-amber-900/20" : "border-gray-700 text-gray-500"
            }`}>
              {l.manual_override ? "HAND" : "AUTO"}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => sendCommand("lift_toggle_pump")}
              disabled={commsLost}
              className={`px-3 py-2 rounded text-xs font-mono border ${
                commsLost ? "bg-gray-800 border-gray-800 text-gray-600 cursor-not-allowed"
                  : "bg-teal-900/40 border-teal-700 text-teal-200 hover:bg-teal-800/40"
              }`}
            >{l.pump_command ? "STOP PUMP" : "START PUMP"}</button>
            {commsLost && (
              <span className="text-sm font-mono text-amber-400">
                ⚠ commands cannot reach the field, the gateway is unresponsive
              </span>
            )}
            {l.manual_override && !commsLost && (
              <span className="text-sm font-mono text-amber-400">
                operator has taken HAND control, automatic level control is standing down
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}