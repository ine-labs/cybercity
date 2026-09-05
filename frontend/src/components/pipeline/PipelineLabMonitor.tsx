/**
 * PipelineLabMonitor — Lab Monitor for Redwater Compressor Station (Modbus/TCP)
 * 4-phase attack scenario inspired by PIPEDREAM/INCONTROLLER (CISA AA22-103A, 2022)
 * and TRISIS/TRITON (2017, Schneider Triconex SIS attack, Saudi Arabia)
 */

import { useState } from "react";
import { API_URL } from "../../socket";
import type { ProcessState } from "../../types/process";

interface Props {
  displayed: ProcessState;
  actual: ProcessState;
}

interface Mission {
  id: string;
  phase: number;
  title: string;
  difficulty: "BEGINNER" | "INTERMEDIATE" | "ADVANCED" | "EXPERT";
  objective: string;
  background: string;
  successCondition: string;
  impact: string[];
}

const MISSIONS: Mission[] = [
  {
    id: "recon",
    phase: 1,
    title: "Modbus RTU Reconnaissance",
    difficulty: "BEGINNER",
    objective: "Discover the Modbus RTU and read every coil and register to map the compressor process",
    background: `Modbus has no authentication or encryption whatsoever, any client that can
open the TCP port can read and write any point. Before PIPEDREAM/INCONTROLLER
(CISA advisory AA22-103A, 2022) could sabotage gas and electric infrastructure, its
operators first enumerated the field device's memory map. Reading all four Modbus
tables (coils, discrete inputs, input registers, holding registers) with a tool
like mbpoll dumps the entire process state in seconds.`,
    successCondition: "Connected without authentication and read all coils, inputs, and registers",
    impact: ["Connect to port 5023 with no credentials", "List every writable coil and holding register", "Identify esd_armed (coil 0), prv_block_valve_closed (coil 1), rpm_setpoint (HR 0), and telemetry_spoofed (coil 5) as attack targets"],
  },
  {
    id: "setpoint",
    phase: 2,
    title: "Setpoint Manipulation",
    difficulty: "INTERMEDIATE",
    objective: "Write the compressor RPM setpoint (holding register) past safe limits and watch the safety system respond",
    background: `A naive attacker jumps straight to sabotage. Push the compressor setpoint hard
and the plant's own protection will likely catch it, the ESD trips the compressor
and opens the blowdown valve before real damage occurs. This is the lesson: a
single register write against an unguarded point is not enough. Defense in
depth exists precisely to absorb exactly this kind of attack.`,
    successCondition: "ESD trips (esd_tripped=true) before any lasting damage — the safety system did its job",
    impact: ["compressor_rpm climbs then drops to 0", "Blowdown valve opens automatically", "Lesson: single-point sabotage against an armed SIS just triggers a safe shutdown"],
  },
  {
    id: "trisis",
    phase: 3,
    title: "Safety System Bypass, TRISIS Pattern",
    difficulty: "ADVANCED",
    objective: "Disable BOTH the electronic ESD and the mechanical PRV isolation before re-attempting the overspeed",
    background: `The TRISIS/TRITON malware (2017, Saudi Arabia) targeted Schneider Electric
Triconex Safety Instrumented Systems directly, not the process, the thing that
protects the process. This station has two independent layers: the electronic
ESD (Layer 1) and a mechanical Pressure Relief Valve (Layer 2) that can vent to
atmosphere with no electronics involved at all, UNLESS its isolation valve is
closed. Real-world precedent for defeating a mechanical relief valve: the 2005
BP Texas City disaster, caused in part by a blocked-in relief valve.

"Don't just break things. Break the things that prevent things from breaking."`,
    successCondition: "esd_armed=false AND prv_block_valve_closed=true AND pipe_stress climbing past 50%",
    impact: ["Both defense-in-depth layers defeated", "Discharge pressure sustained above 1,540 psi with no relief", "Pipe stress index climbs steadily toward the 100% rupture threshold"],
  },
  {
    id: "pipedream",
    phase: 4,
    title: "PIPEDREAM Pattern, Telemetry Spoofing to Rupture",
    difficulty: "EXPERT",
    objective: "Activate telemetry spoofing so the operator HMI freezes at 'nominal', then finish the job undetected",
    background: `PIPEDREAM/INCONTROLLER (CISA/NSA/FBI/DOE advisory AA22-103A, 2022) is described
as the most versatile ICS attack toolkit ever publicly documented, purpose-built
to manipulate PLCs and safety controllers in energy infrastructure while evading
detection. The same principle drove Stuxnet (2010): it fed Iranian operators
fabricated "normal" centrifuge telemetry while the real machines spun themselves
to failure. This RTU has an undocumented diagnostic coil (coil 5) that
freezes every value the Modbus master and operator HMI receive. Activate it, and
the Control Room screen will show nominal pressure, RPM, and vibration,
indefinitely, no matter what actually happens to the pipe.`,
    successCondition: "actual.pipeline.ruptured = true while displayed.pipeline still reads nominal",
    impact: [
      "Ground truth (Lab Monitor / actual state): catastrophic pipeline rupture",
      "Operator HMI (Control Room / displayed state): frozen nominal readings — no alarm ever fires",
      "Real-world consequence: by the time physical evidence forces recognition, the segment has already failed",
    ],
  },
];

const DIFF_COLORS: Record<string, string> = {
  BEGINNER:     "bg-green-900/50 text-green-300 border-green-700",
  INTERMEDIATE: "bg-amber-900/50 text-amber-300 border-amber-700",
  ADVANCED:     "bg-orange-900/50 text-orange-300 border-orange-700",
  EXPERT:       "bg-red-900/60 text-red-300 border-red-700",
};

export function PipelineLabMonitor({ displayed, actual }: Props) {
  const [selectedMission, setSelectedMission] = useState(0);
  const [showPointMap, setShowPointMap] = useState(false);
  const mission = MISSIONS[selectedMission];
  const p = actual.pipeline;
  const d = displayed.pipeline;
  if (!p) return null;

  const isUnderAttack =
    !p.esd_armed || p.prv_block_valve_closed || p.esd_tripped ||
    p.ruptured || p.high_pressure_alarm || p.overspeed_alarm || p.telemetry_spoofed;

  const isSpoofed = p.telemetry_spoofed;
  const isDeceived = isSpoofed && (
    Math.abs(p.discharge_pressure - d.discharge_pressure) > 5 ||
    p.ruptured !== d.ruptured ||
    Math.abs(p.compressor_rpm - d.compressor_rpm) > 50
  );

  const resetSystem = async () => {
    await fetch(`${API_URL}/api/reset`, { method: "POST" });
  };

  return (
    <div className="bg-gray-950 text-white p-4 h-full">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h1 className="text-xl font-mono font-bold text-orange-400">LAB MONITOR</h1>
          <p className="text-sm font-mono text-gray-500">
            Redwater Compressor Station: Attack via Modbus, observe ground-truth impact here
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowPointMap(!showPointMap)}
            className="bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-2 rounded font-mono text-xs border border-gray-700"
          >
            {showPointMap ? "HIDE" : "SHOW"} MODBUS POINT MAP
          </button>
          <button
            onClick={resetSystem}
            className="bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-2 rounded font-mono text-xs border border-gray-700"
          >
            RESET SYSTEM
          </button>
        </div>
      </div>

      {showPointMap && (
        <div className="bg-gray-900 rounded-lg p-3 border border-gray-800 mb-4">
          <h3 className="text-xs font-mono text-cyan-400 mb-2 font-bold">
            MODBUS POINT MAP — Redwater Compressor Station (Unit ID 1)
          </h3>
          <div className="flex gap-2 mb-2 text-[10px] font-mono text-gray-500">
            <span>Protocol: <span className="text-cyan-400">Modbus/TCP</span></span>
            <span>|</span>
            <span>Port: <span className="text-cyan-400">TCP 5023</span></span>
            <span>|</span>
            <span>Auth: <span className="text-red-400">None</span></span>
          </div>
          <table className="w-full text-xs font-mono">
            <thead>
              <tr className="text-gray-500 border-b border-gray-800">
                <th className="text-left p-1">Address</th>
                <th className="text-left p-1">Table (FC)</th>
                <th className="text-left p-1">Access</th>
                <th className="text-left p-1">Description</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["IR 0–6",   "Input Register (04)",  "R", "Suction/discharge pressure, RPM, temp, vibration, flow, pipe stress"],
                ["DI 0–9",   "Discrete Input (02)",  "R", "Valve/ESD/PRV status, alarms, rupture flag"],
                ["Coil 0",   "Coil (01/05)",         "W", "ATTACKABLE — esd_armed (write 0 = bypass SIS)"],
                ["Coil 1",   "Coil (01/05)",         "W", "ATTACKABLE — prv_block_valve_closed (write 1 = block relief)"],
                ["Coil 2–4", "Coil (01/05)",         "W", "ATTACKABLE — suction / discharge / blowdown valve commands"],
                ["Coil 5",   "Coil (01/05)",         "W", "UNDOCUMENTED — telemetry_spoofed (write 1 = freeze HMI)"],
                ["HR 0",     "Holding Register (03/06)", "W", "ATTACKABLE — rpm_setpoint"],
              ].map(([ref, group, rw, desc]) => (
                <tr key={ref} className={`border-b border-gray-800/30 ${rw === "W" ? "text-red-300" : "text-gray-300"}`}>
                  <td className="p-1 text-cyan-400">{ref}</td>
                  <td className="p-1 text-gray-500">{group}</td>
                  <td className="p-1">
                    <span className={`px-1 rounded ${rw === "W" ? "bg-red-900 text-red-300" : "bg-gray-800 text-gray-400"}`}>{rw}</span>
                  </td>
                  <td className="p-1 text-gray-500 text-[10px]">{desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-[10px] text-red-400 mt-2">
            Red rows = writable (attackable) — no authentication required. Any Modbus master (mbpoll,
            Metasploit) can read or write every point.
          </p>
        </div>
      )}

      <div className="flex gap-2 mb-4">
        {MISSIONS.map((m, i) => (
          <button
            key={m.id}
            onClick={() => setSelectedMission(i)}
            className={`px-3 py-2 rounded font-mono text-xs border ${
              selectedMission === i
                ? "bg-orange-900 border-orange-600 text-orange-200"
                : "bg-gray-900 border-gray-700 text-gray-400 hover:border-gray-500"
            }`}
          >
            Phase {i + 1}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-3">
        {/* Left: Mission briefing */}
        <div className="col-span-2 space-y-3">
          <div className="bg-gray-900 rounded-lg p-4 border border-gray-800">
            <div className="flex justify-between items-start mb-3">
              <h2 className="font-mono text-sm font-bold text-gray-200">
                Phase {mission.phase}: {mission.title}
              </h2>
              <span className={`text-xs font-mono px-2 py-1 rounded border ${DIFF_COLORS[mission.difficulty]}`}>
                {mission.difficulty}
              </span>
            </div>
            <div className="mb-3">
              <h3 className="text-xs font-mono text-amber-400 mb-1">OBJECTIVE</h3>
              <p className="text-xs text-gray-300">{mission.objective}</p>
            </div>
            <div className="mb-3">
              <h3 className="text-xs font-mono text-gray-500 mb-1">BACKGROUND</h3>
              <p className="text-xs text-gray-400 italic whitespace-pre-line">{mission.background}</p>
            </div>
            <div className="mb-3">
              <h3 className="text-xs font-mono text-green-400 mb-1">SUCCESS CONDITION</h3>
              <p className="text-xs text-green-300">{mission.successCondition}</p>
            </div>
            <div>
              <h3 className="text-xs font-mono text-blue-400 mb-1">WHERE TO CHECK IMPACT</h3>
              <ul className="text-xs text-gray-400 space-y-1">
                {mission.impact.map((item, i) => (
                  <li key={i} className="flex gap-2"><span className="text-blue-500">-</span> {item}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Right: Live state */}
        <div className="space-y-3">
          <div className={`rounded-lg p-3 border font-mono text-xs text-center font-bold ${
            isUnderAttack ? "bg-red-900/30 border-red-600 text-red-300 animate-pulse" : "bg-green-900/30 border-green-800 text-green-400"
          }`}>
            {isUnderAttack ? "ATTACK DETECTED — Abnormal ground truth" : "NO ATTACK — System normal"}
          </div>

          {/* Deception status — unique to this scenario */}
          <div className={`rounded-lg p-3 border ${
            isDeceived ? "border-purple-600 bg-purple-950/40" : "border-gray-800 bg-gray-900"
          }`}>
            <h3 className={`text-xs font-mono mb-2 font-bold ${isDeceived ? "text-purple-300" : "text-gray-500"}`}>
              DECEPTION STATUS
            </h3>
            {isDeceived ? (
              <div className="space-y-1.5 text-[10px] font-mono">
                <div className="flex justify-between">
                  <span className="text-gray-500">Operator HMI shows</span>
                  <span className="text-green-400 font-bold">{d.discharge_pressure.toFixed(0)} psi · NOMINAL</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Ground truth (here)</span>
                  <span className="text-red-400 font-bold animate-pulse">
                    {p.discharge_pressure.toFixed(0)} psi {p.ruptured ? "· RUPTURED" : "· DEGRADING"}
                  </span>
                </div>
                <div className="mt-2 text-purple-300">
                  The operator cannot see this divergence. Only this Lab Monitor (ground truth) shows it.
                </div>
              </div>
            ) : (
              <div className="text-[10px] font-mono text-gray-600">
                {p.telemetry_spoofed
                  ? "Spoofing active — waiting for ground truth to diverge from frozen HMI values..."
                  : "Telemetry integrity nominal. HMI and ground truth match."}
              </div>
            )}
          </div>

          <div className="bg-gray-900 rounded-lg p-3 border border-gray-800">
            <h3 className="text-xs font-mono text-cyan-400 mb-2 font-bold">STATION STATUS (ground truth)</h3>
            <div className={`rounded p-2 mb-2 text-center border ${
              p.discharge_pressure >= 1540 ? "border-red-700 bg-red-900/20" :
              p.high_pressure_alarm ? "border-amber-700 bg-amber-900/10" : "border-green-800 bg-green-900/10"
            }`}>
              <div className="text-[9px] text-gray-500 uppercase font-mono">Discharge Pressure</div>
              <div className={`text-lg font-bold font-mono ${
                p.discharge_pressure >= 1540 ? "text-red-400 animate-pulse" :
                p.high_pressure_alarm ? "text-amber-400" : "text-green-400"
              }`}>
                {p.discharge_pressure.toFixed(0)} psi
              </div>
            </div>

            <div className="space-y-1 text-[10px] font-mono">
              <div className="flex justify-between"><span className="text-gray-500">Compressor RPM</span>
                <span className={p.overspeed_alarm ? "text-amber-400 font-bold" : "text-gray-300"}>{p.compressor_rpm.toFixed(0)}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Vibration</span>
                <span className={p.vibration > 10 ? "text-red-400 font-bold" : "text-gray-300"}>{p.vibration.toFixed(1)} mils</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Pipe Stress</span>
                <span className={p.pipe_stress > 75 ? "text-red-400 font-bold" : p.pipe_stress > 40 ? "text-amber-400" : "text-gray-300"}>{p.pipe_stress.toFixed(0)}%</span></div>
            </div>

            {p.ruptured && (
              <div className="mt-2 p-2 rounded bg-red-900/40 border border-red-700 text-center">
                <div className="text-red-300 font-bold text-xs animate-pulse font-mono">PIPELINE RUPTURE</div>
                <div className="text-red-500 text-[9px] font-mono">{p.failure_mode}</div>
              </div>
            )}
          </div>

          <div className="bg-gray-900 rounded-lg p-3 border border-red-900/30">
            <h3 className="text-xs font-mono text-red-400 mb-2 font-bold">SAFETY LAYERS</h3>
            <div className="space-y-1.5 text-xs font-mono">
              {[
                { label: "ESD / SIS (Layer 1)", val: p.esd_armed },
                { label: "PRV Isolation (Layer 2)", val: !p.prv_block_valve_closed },
              ].map(({ label, val }) => (
                <div key={label} className="flex justify-between">
                  <span className="text-gray-500">{label}</span>
                  <span className={!val ? "text-red-400 font-bold" : "text-gray-300"}>{val ? "OK" : "DOWN ⚠"}</span>
                </div>
              ))}
            </div>
          </div>

          {mission.id === "pipedream" && (
            <div className={`rounded-lg border p-3 ${
              p.ruptured && isDeceived ? "border-red-700 bg-red-900/20" : "border-gray-800 bg-gray-900"
            }`}>
              <h3 className="text-xs font-mono text-gray-500 mb-2 font-bold">PIPEDREAM PROGRESS</h3>
              <div className="space-y-1">
                {[
                  { label: "ESD Bypassed",       done: !p.esd_armed },
                  { label: "PRV Isolated",       done: p.prv_block_valve_closed },
                  { label: "Telemetry Spoofed",  done: p.telemetry_spoofed },
                  { label: "HMI Shows Nominal",  done: isSpoofed && !d.high_pressure_alarm },
                  { label: "Pipe Stress > 50%",  done: p.pipe_stress > 50 },
                  { label: "RUPTURE Achieved",   done: p.ruptured },
                ].map(item => (
                  <div key={item.label} className="flex items-center gap-1.5 text-[10px] font-mono">
                    <span className={item.done ? "text-green-500" : "text-gray-700"}>{item.done ? "✓" : "○"}</span>
                    <span className={item.done ? "text-gray-300" : "text-gray-600"}>{item.label}</span>
                  </div>
                ))}
              </div>
              {p.ruptured && isDeceived && (
                <div className="mt-2 p-2 rounded bg-red-900/40 border border-red-700 text-center">
                  <div className="text-red-300 font-bold text-[10px] animate-pulse font-mono">
                    ATTACK COMPLETE — PIPEDREAM PATTERN EXECUTED
                  </div>
                  <div className="text-red-500 text-[9px] font-mono mt-1">
                    Segment ruptured · operator HMI never showed a single alarm
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
