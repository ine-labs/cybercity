/**
 * GridLabMonitor — Lab Monitor for Power Grid Substation (IEC 60870-5-104)
 * 4-phase attack scenario inspired by Ukraine 2015/2016 + Industroyer/Crashoverride malware
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
    title: "IED Reconnaissance",
    difficulty: "BEGINNER",
    objective: "Discover the IEC 60870-5-104 outstation and enumerate all information points",
    background: `Before the 2015 Ukraine attack, BlackEnergy operators spent months mapping
SCADA infrastructure. The Industroyer malware (2016) contained a purpose-built
IEC 60870-5-104 module that could enumerate substation RTUs and map information
object addresses before issuing control commands. Reconnaissance is step 0 of
every grid attack.`,
    successCondition: "Successfully connected, ran a General Interrogation, and enumerated all writable points",
    impact: ["Connect to port 5022", "STARTDT accepted without authentication", "General Interrogation lists every XCBR (breaker) and protection relay point"],
  },
  {
    id: "measurement",
    phase: 2,
    title: "Live Telemetry Monitoring",
    difficulty: "BEGINNER",
    objective: "Monitor real-time substation measurements to understand normal operating state",
    background: `Industroyer's IEC 60870-5-104 component polled substation measurements continuously
before the attack to understand the grid topology and identify the right sequence
for CB tripping. Knowing which transformers are loaded and which CBs to trip first
is critical for a coordinated attack, tripping a lightly loaded transformer
wastes the attack. Target the heavily loaded one.`,
    successCondition: "Read all measurements and confirmed protection relays are currently enabled",
    impact: ["Identify TX1 and TX2 loading %", "Confirm frequency is 60.0 Hz", "Note which protection relays are ENABLED — these are your targets in Phase 4"],
  },
  {
    id: "isolation",
    phase: 3,
    title: "Selective Circuit Breaker Tripping",
    difficulty: "INTERMEDIATE",
    objective: "Trip circuit breakers to shed load and overload transformers",
    background: `In the 2015 Ukraine attack, operators manually opened circuit breakers
in 30 substations within minutes. The 2016 Industroyer attack automated this
with purpose-built malware. The goal is selective isolation: trip feeders to
shed load from specific zones, or trip transformer breakers to cascade load
onto the surviving unit. CB3 (TX1 primary) is the high-value target:
when TX1 goes, TX2 must carry 190 MW alone on a 200 MVA rating.`,
    successCondition: "TX2 loading exceeds 85% (overload alarm) after CB3 is tripped",
    impact: ["CB5/CB6: Selective load shedding (industrial/residential dark)", "CB3: TX1 offline → TX2 overloads at 95%", "Watch TX2 temperature rising in the Control Room trend chart"],
  },
  {
    id: "industroyer",
    phase: 4,
    title: "Industroyer Pattern, Coordinated Blackout",
    difficulty: "EXPERT",
    objective: "Disable protection relays and trip ALL circuit breakers to cause a permanent blackout",
    background: `The INDUSTROYER/CRASHOVERRIDE malware (attributed to Sandworm, Russia)
used in the 2016 Ukraine attack followed this exact sequence:

  1. Disable protective relays, prevents automatic recovery
  2. Open ALL circuit breakers simultaneously via IEC 60870-5-104
  3. Disable auto-recloser, blocks automatic reconnection
  4. Grid loses voltage; frequency collapses
  5. Operators cannot remotely reconnect (firmware wiped by wiper component)

The attack caused a blackout affecting 200,000+ customers in Kiev.
The TRISIS/Triton SIS attack (2017, Saudi Arabia) used the same principle:
disable the safety system BEFORE triggering the dangerous condition.

"Don't just break things. Break the thing that prevents things from breaking."`,
    successCondition: "blackout=true, all 7 CBs open, autorecloser=false, frequency → 0 Hz",
    impact: [
      "190 MW total load lost (Industrial + Residential + Critical infrastructure)",
      "Grid frequency collapses (observe in Control Room trend)",
      "Auto-recloser disabled: operators cannot remotely restore power",
      "Without protection: TX1/TX2 thermally damaged before trip → physical replacement required",
      "Real-world consequence: hours to days of restoration time",
    ],
  },
];

const DIFF_COLORS: Record<string, string> = {
  BEGINNER:     "bg-green-900/50 text-green-300 border-green-700",
  INTERMEDIATE: "bg-amber-900/50 text-amber-300 border-amber-700",
  ADVANCED:     "bg-orange-900/50 text-orange-300 border-orange-700",
  EXPERT:       "bg-red-900/60 text-red-300 border-red-700",
};

export function GridLabMonitor({ displayed, actual }: Props) {
  const [selectedMission, setSelectedMission] = useState(0);
  const [showObjectMap, setShowObjectMap] = useState(false);
  const mission = MISSIONS[selectedMission];
  const grid = actual.grid;
  if (!grid) return null;

  const cb = grid.cb_states || new Array(7).fill(true);
  const allCbsOpen = cb.every(c => !c);

  const isUnderAttack =
    !cb.every(Boolean) ||
    !grid.protection_enabled ||
    !grid.diff_prot_enabled ||
    !grid.overcurrent_enabled ||
    !grid.underfreq_enabled ||
    grid.blackout ||
    grid.tx1_tripped ||
    grid.tx2_tripped;

  const cbNames = ["Line 1 (Gen)", "Line 2 (Grid)", "TX1 Primary", "TX2 Primary",
                   "Feeder A (Ind)", "Feeder B (Res)", "Feeder C (Crit)"];

  const resetSystem = async () => {
    await fetch(`${API_URL}/api/reset`, { method: "POST" });
  };

  return (
    <div className="bg-gray-950 text-white p-4 h-full">
      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <div>
          <h1 className="text-xl font-mono font-bold text-amber-400">
            LAB MONITOR
          </h1>
          <p className="text-sm font-mono text-gray-500">
            Copperline Substation: Attack via IEC 60870-5-104, observe impact here
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowObjectMap(!showObjectMap)}
            className="bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-2 rounded font-mono text-xs border border-gray-700"
          >
            {showObjectMap ? "HIDE" : "SHOW"} IEC OBJECT MAP
          </button>
          <button
            onClick={resetSystem}
            className="bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-2 rounded font-mono text-xs border border-gray-700"
          >
            RESET SYSTEM
          </button>
        </div>
      </div>

      {/* IEC 104 Point Map (toggleable) */}
      {showObjectMap && (
        <div className="bg-gray-900 rounded-lg p-3 border border-gray-800 mb-4">
          <h3 className="text-xs font-mono text-cyan-400 mb-2 font-bold">
            IEC 60870-5-104 POINT MAP — Copperline Substation (CA=1)
          </h3>
          <div className="flex gap-2 mb-2 text-[10px] font-mono text-gray-500">
            <span>Protocol: <span className="text-cyan-400">IEC 60870-5-104</span></span>
            <span>|</span>
            <span>Port: <span className="text-cyan-400">TCP 5022</span></span>
            <span>|</span>
            <span>Auth: <span className="text-red-400">None</span></span>
          </div>
          <table className="w-full text-xs font-mono">
            <thead>
              <tr className="text-gray-500 border-b border-gray-800">
                <th className="text-left p-1">IOA</th>
                <th className="text-left p-1">Type ID</th>
                <th className="text-left p-1">Access</th>
                <th className="text-left p-1">Description</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["1–7",   "M_DP_NA_1 (3)",  "R", "XCBR1–7 breaker position (double-point)"],
                ["1–7",   "C_DC_NA_1 (46)", "W", "ATTACKABLE — XCBR1–7 double command (trip/close)"],
                ["201",   "M_ME_NC_1 (13)", "R", "System frequency (Hz)"],
                ["204",   "M_ME_NC_1 (13)", "R", "Active power (MW)"],
                ["202",   "M_ME_NC_1 (13)", "R", "HV bus voltage (kV)"],
                ["203",   "M_ME_NC_1 (13)", "R", "LV bus voltage (kV)"],
                ["207",   "M_ME_NC_1 (13)", "R", "TX1 loading %"],
                ["208",   "M_ME_NC_1 (13)", "R", "TX2 loading %"],
                ["209",   "M_ME_NC_1 (13)", "R", "TX1 winding temperature °C"],
                ["210",   "M_ME_NC_1 (13)", "R", "TX2 winding temperature °C"],
                ["101",   "M_SP_NA_1 (1)",  "W", "ATTACKABLE — Master protection relay"],
                ["102",   "M_SP_NA_1 (1)",  "W", "ATTACKABLE — 87T differential relay"],
                ["103",   "M_SP_NA_1 (1)",  "W", "ATTACKABLE — 51 overcurrent relay"],
                ["104",   "M_SP_NA_1 (1)",  "W", "ATTACKABLE — 81L under-frequency relay"],
                ["105",   "M_SP_NA_1 (1)",  "W", "ATTACKABLE — 79 auto-recloser"],
                ["300",   "M_SP_NA_1 (1)",  "R", "Blackout status"],
                ["211",   "M_ME_NC_1 (13)", "R", "Grid stress %"],
              ].map(([ioa, type, rw, desc]) => (
                <tr
                  key={`${ioa}-${type}`}
                  className={`border-b border-gray-800/30 ${rw === "W" ? "text-red-300" : "text-gray-300"}`}
                >
                  <td className="p-1 text-cyan-400">{ioa}</td>
                  <td className="p-1 text-gray-500">{type}</td>
                  <td className="p-1">
                    <span className={`px-1 rounded ${rw === "W" ? "bg-red-900 text-red-300" : "bg-gray-800 text-gray-400"}`}>
                      {rw}
                    </span>
                  </td>
                  <td className="p-1 text-gray-500 text-[10px]">{desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-[10px] text-red-400 mt-2">
            Red rows = writable (attackable) — no authentication required. Reach every point with a
            General Interrogation (C_IC_NA_1) — no vendor-specific engineering tool needed.
          </p>
        </div>
      )}

      {/* Mission selector */}
      <div className="flex gap-2 mb-4">
        {MISSIONS.map((m, i) => (
          <button
            key={m.id}
            onClick={() => setSelectedMission(i)}
            className={`px-3 py-2 rounded font-mono text-xs border ${
              selectedMission === i
                ? "bg-amber-900 border-amber-600 text-amber-200"
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
                  <li key={i} className="flex gap-2">
                    <span className="text-blue-500">-</span> {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Right: Live state */}
        <div className="space-y-3">
          {/* Attack detection */}
          <div
            className={`rounded-lg p-3 border font-mono text-xs text-center font-bold ${
              isUnderAttack
                ? "bg-red-900/30 border-red-600 text-red-300 animate-pulse"
                : "bg-green-900/30 border-green-800 text-green-400"
            }`}
          >
            {isUnderAttack
              ? "ATTACK DETECTED — Abnormal values"
              : "NO ATTACK — System normal"}
          </div>

          {/* Grid Status */}
          <div className="bg-gray-900 rounded-lg p-3 border border-gray-800">
            <h3 className="text-xs font-mono text-cyan-400 mb-2 font-bold">
              GRID STATUS
            </h3>

            {/* Frequency */}
            <div className={`rounded p-2 mb-2 text-center border ${
              grid.frequency < 58.5 ? "border-red-700 bg-red-900/20" :
              grid.frequency < 59.5 ? "border-amber-700 bg-amber-900/10" :
              "border-green-800 bg-green-900/10"
            }`}>
              <div className="text-[9px] text-gray-500 uppercase font-mono">Frequency</div>
              <div className={`text-lg font-bold font-mono ${
                grid.frequency < 58.5 ? "text-red-400 animate-pulse" :
                grid.frequency < 59.5 ? "text-amber-400" : "text-green-400"
              }`}>
                {grid.frequency > 0 ? grid.frequency.toFixed(3) : "0.000"} Hz
              </div>
            </div>

            {/* CB states */}
            <div className="space-y-0.5 mb-2">
              {cbNames.map((name, i) => (
                <div key={i} className="flex items-center justify-between text-[10px] font-mono">
                  <span className="text-gray-500">CB{i + 1}</span>
                  <span className={`font-bold ${cb[i] ? "text-green-500" : "text-red-400"}`}>
                    {cb[i] ? "■ CLOSED" : "□ OPEN"}
                  </span>
                </div>
              ))}
            </div>

            {/* TX stats */}
            <div className="border-t border-gray-800 pt-2 space-y-1">
              {[
                { label: "TX1", load: grid.tx1_load_pct, temp: grid.tx1_temp, tripped: grid.tx1_tripped },
                { label: "TX2", load: grid.tx2_load_pct, temp: grid.tx2_temp, tripped: grid.tx2_tripped },
              ].map(tx => (
                <div key={tx.label} className="flex justify-between text-[10px] font-mono">
                  <span className="text-gray-500">{tx.label}</span>
                  <span className={tx.tripped ? "text-red-400 font-bold" : tx.load > 85 ? "text-amber-400" : "text-cyan-300"}>
                    {tx.tripped ? "TRIPPED" : `${tx.load.toFixed(0)}% · ${tx.temp.toFixed(0)}°C`}
                  </span>
                </div>
              ))}
            </div>

            {grid.blackout && (
              <div className="mt-2 p-2 rounded bg-red-900/40 border border-red-700 text-center">
                <div className="text-red-300 font-bold text-xs animate-pulse font-mono">BLACKOUT</div>
                <div className="text-red-500 text-[9px] font-mono">190 MW supply lost</div>
              </div>
            )}
          </div>

          {/* Protection Relays */}
          <div className="bg-gray-900 rounded-lg p-3 border border-red-900/30">
            <h3 className="text-xs font-mono text-red-400 mb-2 font-bold">
              PROTECTION RELAYS
            </h3>
            <div className="space-y-1.5 text-xs font-mono">
              {[
                { label: "Master Protection", val: grid.protection_enabled },
                { label: "Differential (87T)", val: grid.diff_prot_enabled },
                { label: "Overcurrent (51)", val: grid.overcurrent_enabled },
                { label: "Under-Freq (81L)", val: grid.underfreq_enabled },
                { label: "Auto-Recloser (79)", val: grid.autorecloser_enabled },
              ].map(({ label, val }) => (
                <div key={label} className="flex justify-between">
                  <span className="text-gray-500">{label}</span>
                  <span className={!val ? "text-red-400 font-bold" : "text-gray-300"}>
                    {val ? "ON" : "OFF ⚠"}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Phase 4: Industroyer progress */}
          {mission.id === "industroyer" && (
            <div className={`rounded-lg border p-3 ${
              allCbsOpen && grid.blackout && !grid.autorecloser_enabled
                ? "border-red-700 bg-red-900/20"
                : "border-gray-800 bg-gray-900"
            }`}>
              <h3 className="text-xs font-mono text-gray-500 mb-2 font-bold">
                INDUSTROYER PROGRESS
              </h3>
              <div className="space-y-1">
                {[
                  { label: "Protection Disabled", done: !grid.protection_enabled },
                  { label: "Differential OFF",    done: !grid.diff_prot_enabled },
                  { label: "Overcurrent OFF",     done: !grid.overcurrent_enabled },
                  { label: "UFLS OFF",            done: !grid.underfreq_enabled },
                  { label: "Auto-Recloser OFF",   done: !grid.autorecloser_enabled },
                  { label: "All 7 CBs Open",      done: allCbsOpen },
                  { label: "Freq < 58 Hz",        done: grid.frequency < 58 && grid.frequency > 0 },
                  { label: "BLACKOUT Achieved",   done: grid.blackout },
                ].map(item => (
                  <div key={item.label} className="flex items-center gap-1.5 text-[10px] font-mono">
                    <span className={item.done ? "text-green-500" : "text-gray-700"}>
                      {item.done ? "✓" : "○"}
                    </span>
                    <span className={item.done ? "text-gray-300" : "text-gray-600"}>{item.label}</span>
                  </div>
                ))}
              </div>
              {allCbsOpen && grid.blackout && !grid.autorecloser_enabled && (
                <div className="mt-2 p-2 rounded bg-red-900/40 border border-red-700 text-center">
                  <div className="text-red-300 font-bold text-[10px] animate-pulse font-mono">
                    ATTACK COMPLETE — INDUSTROYER EXECUTED
                  </div>
                  <div className="text-red-500 text-[9px] font-mono mt-1">
                    Permanent blackout · 190 MW lost
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
