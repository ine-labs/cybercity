/**
 * LiftLabMonitor — Lab Monitor for Cedar Creek Lift Station 7 (protocol flooding).
 * A denial-of-control scenario: flood the legacy serial gateway with standard
 * tools (nmap / hping3 / nping) until the station controller is starved, the
 * pump loses control, and the wet well overflows — while the operator HMI
 * freezes on stale data. No values are ever written.
 *
 * Solution commands live in solutions/cedarcreek.md, not in this UI.
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
  title: string;
  difficulty: "BEGINNER" | "INTERMEDIATE" | "ADVANCED" | "EXPERT";
  objective: string;
  background: string;
  successCondition: string;
  checkImpact: string[];
}

const MISSIONS: Mission[] = [
  {
    id: "recon",
    title: "Phase 1: Discover the Comms Gateway",
    difficulty: "BEGINNER",
    objective: "Find the remote lift station's serial-to-Ethernet gateway and confirm it is a live, unauthenticated UDP service.",
    background: "Remote wastewater lift stations are unmanned and polled over cheap serial-to-Ethernet gateways (Moxa NPort / Lantronix style), shipped with no rate limiting, no source filtering, and no authentication. Project SHINE (2012-2014) catalogued hundreds of thousands of exactly this class of device sitting exposed on the public internet, discoverable with nothing more than a port scan.",
    successCondition: "Gateway found on UDP 5025 and confirmed responding to any input with no authentication.",
    checkImpact: [
      "Legacy serial gateway identified on UDP 5025",
      "No auth / no rate limiting — a single host can reach it",
      "The station's entire control + telemetry path runs through this one device",
    ],
  },
  {
    id: "baseline",
    title: "Phase 2: Weigh the Target",
    difficulty: "BEGINNER",
    objective: "Use Wireshark to observe normal polling and confirm how little traffic this legacy gateway can actually handle.",
    background: "Serial fieldbus links typically run at 9,600 to 115,200 bps, RS-232/RS-485 speeds essentially unchanged since the 1980s, while the same gateway's Ethernet port can accept full 100 Mbps line rate. That mismatch is inherent to the product category, not a misconfiguration: the Ethernet side will always be able to accept far more traffic than the serial side can ever drain.",
    successCondition: "Confirmed the gateway sits far below its saturation threshold under normal polling.",
    checkImpact: [
      "Baseline poll rate is tiny (a few pkt/s)",
      "Gateway capacity is only a few hundred pkt/s",
      "A commodity flood tool can exceed that by 100x or more",
    ],
  },
  {
    id: "flood",
    title: "Phase 3: Flood the Gateway, Denial of Control",
    difficulty: "INTERMEDIATE",
    objective: "Saturate the gateway with a UDP flood so the station goes blind, the pump loses control, and the wet well overflows.",
    background: "Real precedent: Maroochy Shire, Queensland, 2000. A disgruntled former SCADA contractor, Vitek Boden, used stolen radio equipment to seize control of the shire's sewage pumping stations over their wireless link, disabling alarms and pumps. Over three months and at least 46 intrusions, roughly 800,000 liters of raw sewage spilled into local parks and waterways, one of the first documented cyberattacks on a control system to cause real environmental damage. This attack mirrors that consequence: cut off a lift station's control link, by any means, and the same kind of spill follows.",
    successCondition: "Gateway saturated, field comms lost, pump uncontrolled, actual wet well overflows while the HMI stays stale.",
    checkImpact: [
      "Ground truth (this Lab Monitor): wet well overflows, raw sewage spill climbing",
      "Operator HMI (Control Room): frozen stale reading + COMMS LOST — blind to the spill",
    ],
  },
];

const DIFF_COLORS: Record<string, string> = {
  BEGINNER:     "bg-green-900/50 text-green-300 border-green-700",
  INTERMEDIATE: "bg-amber-900/50 text-amber-300 border-amber-700",
  ADVANCED:     "bg-orange-900/50 text-orange-300 border-orange-700",
  EXPERT:       "bg-red-900/60 text-red-300 border-red-700",
};

export function LiftLabMonitor({ displayed, actual }: Props) {
  const [selectedMission, setSelectedMission] = useState(0);
  const [showTarget, setShowTarget] = useState(false);
  const mission = MISSIONS[selectedMission];
  const c = actual.lift;
  const d = displayed.lift;
  if (!c) return null;

  const saturated = c.gateway_pkt_rate > c.gateway_capacity;
  const isUnderAttack = saturated || !c.field_comms_ok || c.overflow || c.high_level_alarm;
  const isBlind = d.comms_lost || !c.field_comms_ok;

  const resetSystem = async () => {
    await fetch(`${API_URL}/api/reset`, { method: "POST" });
  };

  return (
    <div className="bg-gray-950 text-white p-4 h-full">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h1 className="text-xl font-mono font-bold text-teal-400">LAB MONITOR</h1>
          <p className="text-sm font-mono text-gray-500">
            Cedar Creek Lift Station 7 — Flood the comms gateway, observe ground-truth impact here
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowTarget(!showTarget)}
            className="bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-2 rounded font-mono text-xs border border-gray-700"
          >
            {showTarget ? "HIDE" : "SHOW"} GATEWAY INFO
          </button>
          <button
            onClick={resetSystem}
            className="bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-2 rounded font-mono text-xs border border-gray-700"
          >
            RESET SYSTEM
          </button>
        </div>
      </div>

      {showTarget && (
        <div className="bg-gray-900 rounded-lg p-3 border border-gray-800 mb-4">
          <h3 className="text-xs font-mono text-cyan-400 mb-2 font-bold">
            TARGET — Serial-to-Ethernet Gateway (Cedar Creek LS-7)
          </h3>
          <table className="w-full text-xs font-mono">
            <tbody>
              {[
                ["Protocol", "Serial-over-UDP (Modbus RTU tunnel)"],
                ["Port", "UDP 5025"],
                ["Back-end capacity", `~${c.gateway_capacity} pkt/s (serial-line limited)`],
                ["Authentication", "None"],
                ["Rate limiting", "None"],
                ["Source filtering", "None"],
                ["Weakness", "Saturating it cuts ALL field comms — sensing and pump control"],
              ].map(([k, v]) => (
                <tr key={k} className="border-b border-gray-800/30">
                  <td className="p-1 text-gray-500 w-40">{k}</td>
                  <td className={`p-1 ${k === "Authentication" || k === "Rate limiting" || k === "Source filtering" ? "text-red-300" : "text-gray-300"}`}>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-[10px] text-red-400 mt-2">No auth, no rate limiting — a single commodity flood tool overwhelms it.</p>
        </div>
      )}

      <div className="flex gap-2 mb-4">
        {MISSIONS.map((m, i) => (
          <button
            key={m.id}
            onClick={() => setSelectedMission(i)}
            className={`px-3 py-2 rounded font-mono text-xs border ${
              selectedMission === i
                ? "bg-teal-900 border-teal-600 text-teal-200"
                : "bg-gray-900 border-gray-700 text-gray-400 hover:border-gray-500"
            }`}
          >
            Phase {i + 1}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-3">
        {/* Left: Mission briefing + commands */}
        <div className="col-span-2 space-y-3">
          <div className="bg-gray-900 rounded-lg p-4 border border-gray-800">
            <div className="flex justify-between items-start mb-3">
              <h2 className="font-mono text-base font-bold text-gray-200">
                {mission.title}
              </h2>
              <span className={`text-xs font-mono px-2 py-1 rounded border ${DIFF_COLORS[mission.difficulty]}`}>
                {mission.difficulty}
              </span>
            </div>
            <div className="mb-3">
              <h3 className="text-xs font-mono text-amber-400 mb-1">OBJECTIVE</h3>
              <p className="text-sm text-gray-300 leading-relaxed">{mission.objective}</p>
            </div>
            <div className="mb-3">
              <h3 className="text-xs font-mono text-gray-500 mb-1">BACKGROUND</h3>
              <p className="text-sm text-gray-400 italic leading-relaxed whitespace-pre-line">{mission.background}</p>
            </div>
            <div className="mb-3">
              <h3 className="text-xs font-mono text-green-400 mb-1">SUCCESS CONDITION</h3>
              <p className="text-sm text-green-300 leading-relaxed">{mission.successCondition}</p>
            </div>
            <div>
              <h3 className="text-xs font-mono text-blue-400 mb-1">WHERE TO CHECK IMPACT</h3>
              <ul className="text-sm text-gray-400 space-y-1">
                {mission.checkImpact.map((item, i) => (
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
            {isUnderAttack ? "ATTACK DETECTED — Abnormal ground truth" : "NO ATTACK — Station nominal"}
          </div>

          {/* Denial-of-control divergence */}
          <div className={`rounded-lg p-3 border ${isBlind ? "border-amber-600 bg-amber-950/40" : "border-gray-800 bg-gray-900"}`}>
            <h3 className={`text-xs font-mono mb-2 font-bold ${isBlind ? "text-amber-300" : "text-gray-500"}`}>
              DENIAL OF CONTROL
            </h3>
            {isBlind ? (
              <div className="space-y-1.5 text-[10px] font-mono">
                <div className="flex justify-between">
                  <span className="text-gray-500">Operator HMI shows</span>
                  <span className="text-green-400 font-bold">{d.wet_well_level.toFixed(0)}% · STALE</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Ground truth (here)</span>
                  <span className="text-red-400 font-bold animate-pulse">
                    {c.wet_well_level.toFixed(0)}% {c.overflow ? "· OVERFLOWING" : "· RISING"}
                  </span>
                </div>
                <div className="mt-2 text-amber-300">
                  Comms are dead. The operator sees a stale reading and cannot command the pump.
                </div>
              </div>
            ) : (
              <div className="text-[10px] font-mono text-gray-600">
                {saturated ? "Gateway saturated — waiting for the control loop to starve..."
                  : "Field comms healthy. HMI and ground truth match."}
              </div>
            )}
          </div>

          {/* Network status */}
          <div className={`rounded-lg p-3 border ${saturated ? "border-red-700 bg-red-900/10" : "border-gray-800 bg-gray-900"}`}>
            <h3 className="text-xs font-mono text-cyan-400 mb-2 font-bold">GATEWAY / NETWORK</h3>
            <div className="flex justify-between text-[10px] font-mono mb-1">
              <span className="text-gray-500">Inbound rate</span>
              <span className={saturated ? "text-red-400 font-bold animate-pulse" : "text-teal-300"}>
                {c.gateway_pkt_rate.toLocaleString()} / {c.gateway_capacity} pkt/s
              </span>
            </div>
            <div className="flex justify-between text-[10px] font-mono">
              <span className="text-gray-500">Field comms</span>
              <span className={!c.field_comms_ok ? "text-red-400 font-bold" : "text-green-400"}>{c.field_comms_ok ? "OK" : "LOST"}</span>
            </div>
          </div>

          {/* Station ground truth */}
          <div className="bg-gray-900 rounded-lg p-3 border border-gray-800">
            <h3 className="text-xs font-mono text-cyan-400 mb-2 font-bold">STATION STATUS (ground truth)</h3>
            <div className={`rounded p-2 mb-2 text-center border ${
              c.overflow ? "border-red-700 bg-red-900/20" : c.high_level_alarm ? "border-amber-700 bg-amber-900/10" : "border-green-800 bg-green-900/10"
            }`}>
              <div className="text-[9px] text-gray-500 uppercase font-mono">Wet Well Level</div>
              <div className={`text-lg font-bold font-mono ${
                c.overflow ? "text-red-400 animate-pulse" : c.high_level_alarm ? "text-amber-400" : "text-green-400"
              }`}>
                {c.wet_well_level.toFixed(0)} %
              </div>
            </div>
            <div className="space-y-1 text-[10px] font-mono">
              <div className="flex justify-between"><span className="text-gray-500">Pump</span>
                <span className={!c.pump_running && c.wet_well_level > 75 ? "text-red-400 font-bold" : "text-gray-300"}>{c.pump_running ? "RUNNING" : "OFF"}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Inflow</span>
                <span className="text-gray-300">{c.inflow_rate.toFixed(0)} L/s</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Spill volume</span>
                <span className={c.spill_volume_l > 0 ? "text-red-400 font-bold" : "text-gray-300"}>{c.spill_volume_l.toFixed(0)} L</span></div>
            </div>
            {c.overflow && (
              <div className="mt-2 p-2 rounded bg-red-900/40 border border-red-700 text-center">
                <div className="text-red-300 font-bold text-xs animate-pulse font-mono">WET WELL OVERFLOW</div>
                <div className="text-red-500 text-[9px] font-mono">raw sewage spill</div>
              </div>
            )}
          </div>

          {mission.id === "flood" && (
            <div className={`rounded-lg border p-3 ${c.overflow && isBlind ? "border-red-700 bg-red-900/20" : "border-gray-800 bg-gray-900"}`}>
              <h3 className="text-xs font-mono text-gray-500 mb-2 font-bold">DENIAL-OF-CONTROL PROGRESS</h3>
              <div className="space-y-1">
                {[
                  { label: "Gateway Saturated", done: saturated },
                  { label: "Field Comms Lost", done: !c.field_comms_ok },
                  { label: "HMI Shows Stale Data", done: isBlind },
                  { label: "Pump Uncontrolled", done: !c.field_comms_ok && !c.pump_running },
                  { label: "Wet Well > 90%", done: c.wet_well_level > 90 },
                  { label: "OVERFLOW / Spill", done: c.overflow },
                ].map(item => (
                  <div key={item.label} className="flex items-center gap-1.5 text-[10px] font-mono">
                    <span className={item.done ? "text-green-500" : "text-gray-700"}>{item.done ? "✓" : "○"}</span>
                    <span className={item.done ? "text-gray-300" : "text-gray-600"}>{item.label}</span>
                  </div>
                ))}
              </div>
              {c.overflow && isBlind && (
                <div className="mt-2 p-2 rounded bg-red-900/40 border border-red-700 text-center">
                  <div className="text-red-300 font-bold text-[10px] animate-pulse font-mono">
                    DENIAL OF CONTROL ACHIEVED
                  </div>
                  <div className="text-red-500 text-[9px] font-mono mt-1">
                    Station overflowing · operator blind
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