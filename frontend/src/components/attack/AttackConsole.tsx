import { useState } from "react";
import { API_URL } from "../../socket";
import type { ProcessState } from "../../types/process";

interface LabMonitorProps {
  displayed: ProcessState;
  actual: ProcessState;
}

type MissionId = "recon" | "eavesdrop" | "register_write";

interface Mission {
  id: MissionId;
  title: string;
  difficulty: string;
  objective: string;
  background: string;
  successCondition: string;
  checkImpact: string[];
}

const MISSIONS: Mission[] = [
  {
    id: "recon",
    title: "Phase 1: Reconnaissance",
    difficulty: "BEGINNER",
    objective: "Discover the Modbus service and enumerate all PLC registers and coils to map the facility's control parameters.",
    background: "In 2013, Iranian hackers discovered the Bowman Avenue Dam's SCADA system was exposed via a cellular modem. Your first step mirrors theirs: find the target and understand what it controls.",
    successCondition: "You can read all 9 holding registers and 6 coils without any authentication.",
    checkImpact: [
      "Control Room: verify the values you read match the dashboard",
      "No visible impact on the system (this is passive reconnaissance)",
    ],
  },
  {
    id: "eavesdrop",
    title: "Phase 2: Passive Eavesdropping",
    difficulty: "BEGINNER",
    objective: "Capture live Modbus traffic and observe that all communication is unencrypted with zero authentication.",
    background: "Modbus/TCP was designed in 1979 for serial communication between PLCs. It has NO encryption, NO authentication, and NO integrity checks. Every real-world ICS running Modbus is vulnerable to eavesdropping.",
    successCondition: "You can see register values in plaintext in captured packets. No credentials observed anywhere.",
    checkImpact: [
      "No visible impact, this is passive observation only",
      "The plant operator HMI continuously polls the PLC over Modbus, so port 5020 always carries live operator traffic to intercept",
    ],
  },
  {
    id: "register_write",
    title: "Phase 3: Register & Coil Manipulation",
    difficulty: "INTERMEDIATE",
    objective: "Abuse the PLC's unauthenticated Modbus interface to carry out three sabotage attacks: overflow the dam, drive the water supply to toxic chlorine levels, and switch off the distribution pump to cut supply to the city.",
    background: "In February 2021, an attacker accessed the Oldsmar FL water treatment plant and changed sodium hydroxide levels from 100 to 11,100 ppm. You will perform a similar attack on our simulated facility.",
    successCondition: "Dam overflows (water level above 85m), OR chlorine exceeds 8 ppm (toxic), OR distribution pressure drops below 40 PSI.",
    checkImpact: [
      "Attack 1 (Overflow the Dam): on Dam View, water level rises and the HIGH LEVEL alarm fires, then the spillway activates to shed the excess",
      "Attack 2 (Toxic Chlorine): on Treatment Plant, the chlorination stage turns red and the CHEMICAL alarm fires",
      "Attack 3 (Distribution Pump Off): on Treatment Plant, pressure falls to 0, PRESSURE alarm, distribution stage goes offline",
      "Control Room: trend charts spike and the alarm panel lights up",
    ],
  },
];

const REGISTER_MAP = [
  { addr: 0, name: "dam_water_level", unit: "m", defaultVal: "50.0", range: "20-85", writable: false, note: "Alarm at 85m (high), 20m (low)" },
  { addr: 1, name: "dam_inflow_rate", unit: "m³/s", defaultVal: "120.0", range: "50-200", writable: false, note: "Natural inflow, varies" },
  { addr: 2, name: "dam_outflow_rate", unit: "m³/s", defaultVal: "120.0", range: "0-300", writable: false, note: "Depends on gate position" },
  { addr: 3, name: "dam_gate_position", unit: "%", defaultVal: "40.0", range: "0-100", writable: true, note: "0=closed, 100=open" },
  { addr: 4, name: "chlorine_dosing_rate", unit: "ppm", defaultVal: "2.5", range: "0.5-8", writable: true, note: "alarm at >8 ppm (toxic)" },
  { addr: 5, name: "ph_level", unit: "pH", defaultVal: "7.2", range: "6.5-8.5", writable: false, note: "Alarm outside 6.5-8.5" },
  { addr: 6, name: "turbidity", unit: "NTU", defaultVal: "1.5", range: "0-5", writable: false, note: "Alarm at >5 NTU" },
  { addr: 7, name: "treatment_tank_level", unit: "%", defaultVal: "60.0", range: "0-100", writable: false, note: "Distribution tank fill" },
  { addr: 8, name: "distribution_pressure", unit: "PSI", defaultVal: "55.0", range: "40-80", writable: false, note: "Alarm at <40 PSI" },
];

const COIL_MAP = [
  { addr: 0, name: "sluice_gate_command", desc: "True forces gate 100% open, False = use register 3 setpoint", writable: true, defaultVal: "False" },
  { addr: 1, name: "intake_pump", desc: "Intake pump on/off", writable: true, defaultVal: "True" },
  { addr: 2, name: "chemical_pump", desc: "Chemical dosing pump on/off", writable: true, defaultVal: "True" },
  { addr: 3, name: "distribution_pump", desc: "Distribution pump on/off", writable: true, defaultVal: "True" },
  { addr: 4, name: "high_level_alarm", desc: "Dam high level alarm (read-only)", writable: false, defaultVal: "False" },
  { addr: 5, name: "chemical_alarm", desc: "Chemical alarm (read-only)", writable: false, defaultVal: "False" },
];

export function AttackConsole({ displayed, actual }: LabMonitorProps) {
  const [selectedMission, setSelectedMission] = useState<MissionId>("recon");
  const [showRegMap, setShowRegMap] = useState(false);

  const mission = MISSIONS.find((m) => m.id === selectedMission)!;

  const resetSystem = async () => {
    await fetch(`${API_URL}/api/reset`, { method: "POST" });
  };

  // Detect attack by checking for manipulated controls (not natural alarms)
  const isUnderAttack =
    actual.dam.gate_position < 5 ||
    actual.dam.gate_position > 90 ||
    !actual.plant.intake_pump ||
    !actual.plant.distribution_pump ||
    actual.plant.chlorine_level > 8;

  return (
    <div className="bg-gray-950 text-white p-4 h-full">
      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <div>
          <h1 className="text-xl font-mono font-bold text-amber-400">
            LAB MONITOR
          </h1>
          <p className="text-sm font-mono text-gray-500">
            Operation Watergate — Attack from your terminal, observe impact here
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowRegMap(!showRegMap)}
            className="bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-2 rounded font-mono text-xs border border-gray-700"
          >
            {showRegMap ? "HIDE" : "SHOW"} REGISTER MAP
          </button>
          <button
            onClick={resetSystem}
            className="bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-2 rounded font-mono text-xs border border-gray-700"
          >
            RESET SYSTEM
          </button>
        </div>
      </div>

      {/* Register Map (toggleable) */}
      {showRegMap && (
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-gray-900 rounded-lg p-3 border border-gray-800">
            <h3 className="text-xs font-mono text-cyan-400 mb-2 font-bold">
              HOLDING REGISTERS (values scaled x100)
            </h3>
            <table className="w-full text-xs font-mono">
              <thead>
                <tr className="text-gray-500 border-b border-gray-800">
                  <th className="text-left p-1">Reg</th>
                  <th className="text-left p-1">Name</th>
                  <th className="text-left p-1">Unit</th>
                  <th className="text-left p-1">Default</th>
                  <th className="text-left p-1">Safe Range</th>
                  <th className="text-left p-1">Notes</th>
                </tr>
              </thead>
              <tbody>
                {REGISTER_MAP.map((r) => (
                  <tr key={r.addr} className={`border-b border-gray-800/30 ${r.writable ? "text-red-300" : "text-gray-300"}`}>
                    <td className="p-1 text-cyan-400">{r.addr}</td>
                    <td className="p-1">{r.name}</td>
                    <td className="p-1 text-gray-500">{r.unit}</td>
                    <td className="p-1 text-yellow-400">{r.defaultVal}</td>
                    <td className="p-1 text-green-400">{r.range}</td>
                    <td className="p-1 text-gray-500 text-[10px]">{r.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-[10px] text-red-400 mt-2">Red rows = writable (attackable) registers</p>
          </div>
          <div className="bg-gray-900 rounded-lg p-3 border border-gray-800">
            <h3 className="text-xs font-mono text-cyan-400 mb-2 font-bold">
              COILS (boolean: True/False)
            </h3>
            <table className="w-full text-xs font-mono">
              <thead>
                <tr className="text-gray-500 border-b border-gray-800">
                  <th className="text-left p-1">Coil</th>
                  <th className="text-left p-1">Name</th>
                  <th className="text-left p-1">Default</th>
                  <th className="text-left p-1">Description</th>
                </tr>
              </thead>
              <tbody>
                {COIL_MAP.map((c) => (
                  <tr key={c.addr} className={`border-b border-gray-800/30 ${c.writable ? "text-red-300" : "text-gray-300"}`}>
                    <td className="p-1 text-cyan-400">{c.addr}</td>
                    <td className="p-1">{c.name}</td>
                    <td className="p-1 text-yellow-400">{c.defaultVal}</td>
                    <td className="p-1 text-gray-500">{c.desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-[10px] text-red-400 mt-2">Red rows = writable (attackable) coils</p>
          </div>
        </div>
      )}

      {/* Mission selector */}
      <div className="flex gap-2 mb-4">
        {MISSIONS.map((m, i) => (
          <button
            key={m.id}
            onClick={() => setSelectedMission(m.id)}
            className={`px-3 py-2 rounded font-mono text-xs border ${
              selectedMission === m.id
                ? "bg-amber-900 border-amber-600 text-amber-200"
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
          {/* Mission briefing */}
          <div className="bg-gray-900 rounded-lg p-4 border border-gray-800">
            <div className="flex justify-between items-start mb-3">
              <h2 className="font-mono text-base font-bold text-gray-200">
                {mission.title}
              </h2>
              <span
                className={`text-xs font-mono px-2 py-1 rounded ${
                  mission.difficulty === "BEGINNER"
                    ? "bg-green-900 text-green-300"
                    : mission.difficulty === "INTERMEDIATE"
                    ? "bg-yellow-900 text-yellow-300"
                    : mission.difficulty === "ADVANCED"
                    ? "bg-orange-900 text-orange-300"
                    : "bg-red-900 text-red-300"
                }`}
              >
                {mission.difficulty}
              </span>
            </div>

            <div className="mb-3">
              <h3 className="text-xs font-mono text-amber-400 mb-1">OBJECTIVE</h3>
              <p className="text-sm text-gray-300 leading-relaxed">{mission.objective}</p>
            </div>

            <div className="mb-3">
              <h3 className="text-xs font-mono text-gray-500 mb-1">BACKGROUND</h3>
              <p className="text-sm text-gray-400 italic leading-relaxed">{mission.background}</p>
            </div>

            <div className="mb-3">
              <h3 className="text-xs font-mono text-green-400 mb-1">SUCCESS CONDITION</h3>
              <p className="text-sm text-green-300 leading-relaxed">{mission.successCondition}</p>
            </div>

            <div>
              <h3 className="text-xs font-mono text-blue-400 mb-1">WHERE TO CHECK IMPACT</h3>
              <ul className="text-sm text-gray-400 space-y-1">
                {mission.checkImpact.map((item, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-blue-500">-</span> {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Right: Live split view */}
        <div className="space-y-3">
          {/* Attack detection indicator */}
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

          {/* Facility Status */}
          <div className="bg-gray-900 rounded-lg p-3 border border-gray-800">
            <h3 className="text-xs font-mono text-cyan-400 mb-2 font-bold">
              FACILITY STATUS
            </h3>
            <div className="space-y-1.5 text-xs font-mono">
              {[
                { label: "Water Level", val: `${actual.dam.water_level.toFixed(1)} m`, warn: actual.dam.water_level > 80 || actual.dam.water_level < 25 },
                { label: "Inflow", val: `${actual.dam.inflow_rate.toFixed(1)} m³/s` },
                { label: "Outflow", val: `${actual.dam.outflow_rate.toFixed(1)} m³/s` },
                { label: "Tank Level", val: `${actual.plant.tank_level.toFixed(1)}%`, warn: actual.plant.tank_level > 90 || actual.plant.tank_level < 10 },
                { label: "Pressure", val: `${actual.plant.distribution_pressure.toFixed(1)} PSI`, warn: actual.plant.distribution_pressure < 45 },
                { label: "pH Level", val: `${actual.plant.ph_level.toFixed(1)}`, warn: actual.plant.ph_level < 6.5 || actual.plant.ph_level > 8.5 },
                { label: "Turbidity", val: `${actual.plant.turbidity.toFixed(1)} NTU`, warn: actual.plant.turbidity > 4 },
              ].map(({ label, val, warn }) => (
                <div key={label} className="flex justify-between">
                  <span className="text-gray-500">{label}</span>
                  <span className={warn ? "text-yellow-400" : "text-cyan-300"}>
                    {val}
                  </span>
                </div>
              ))}
              <div className="flex justify-between border-t border-gray-800 pt-1 mt-1">
                <span className="text-gray-500">Alarms</span>
                <span
                  className={
                    actual.dam.high_level_alarm || actual.plant.chemical_alarm
                      ? "text-yellow-400 animate-pulse font-bold"
                      : "text-cyan-300"
                  }
                >
                  {actual.dam.high_level_alarm || actual.plant.chemical_alarm
                    ? "ACTIVE"
                    : "NONE"}
                </span>
              </div>
            </div>
          </div>

          {/* Attack Parameters */}
          <div className="bg-gray-900 rounded-lg p-3 border border-red-900/30">
            <h3 className="text-xs font-mono text-red-400 mb-2 font-bold">
              ATTACK PARAMETERS
            </h3>
            <div className="space-y-1.5 text-xs font-mono">
              {[
                { label: "Gate Position", val: `${actual.dam.gate_position.toFixed(1)}%`, danger: actual.dam.gate_position < 5 || actual.dam.gate_position > 90 },
                { label: "Chlorine", val: `${actual.plant.chlorine_level.toFixed(1)} ppm`, danger: actual.plant.chlorine_level > 8 },
                { label: "Intake Pump", val: actual.plant.intake_pump ? "ON" : "OFF", danger: !actual.plant.intake_pump },
                { label: "Chemical Pump", val: actual.plant.chemical_pump ? "ON" : "OFF", danger: !actual.plant.chemical_pump },
                { label: "Dist. Pump", val: actual.plant.distribution_pump ? "ON" : "OFF", danger: !actual.plant.distribution_pump },
              ].map(({ label, val, danger }) => (
                <div key={label} className="flex justify-between">
                  <span className="text-gray-500">{label}</span>
                  <span
                    className={
                      danger ? "text-red-400 font-bold" : "text-gray-300"
                    }
                  >
                    {val}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
