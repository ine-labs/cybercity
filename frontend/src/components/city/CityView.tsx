interface CityViewProps {
  onSelectScenario: (id: string) => void;
}

const SCENARIOS = [
  {
    id: "dam",
    title: "Dam & Water Treatment Facility",
    subtitle: "Modbus/TCP — Operation Watergate",
    description:
      "Control a dam's sluice gates and water treatment plant. Exploit unprotected Modbus registers to manipulate water flow, chemical dosing, and pump controls.",
    status: "active" as const,
    gradient: "from-blue-900 via-cyan-900 to-emerald-900",
    border: "border-blue-700",
    icon: (
      <svg viewBox="0 0 100 60" className="w-full h-full">
        {/* Dam wall */}
        <polygon points="20,15 80,15 85,55 15,55" fill="#374151" stroke="#6b7280" strokeWidth="1" />
        {/* Water behind dam */}
        <rect x="0" y="20" width="20" height="35" fill="#1e40af" opacity="0.6" rx="2" />
        <rect x="0" y="25" width="18" height="30" fill="#2563eb" opacity="0.4" rx="2" />
        {/* Water flow below */}
        <path d="M 50 55 Q 55 48 60 55 Q 65 48 70 55 Q 75 48 80 55" fill="none" stroke="#3b82f6" strokeWidth="1.5" opacity="0.7" />
        {/* Gate lines */}
        <line x1="40" y1="35" x2="40" y2="50" stroke="#f59e0b" strokeWidth="1.5" />
        <line x1="60" y1="35" x2="60" y2="50" stroke="#f59e0b" strokeWidth="1.5" />
        {/* Treatment tanks */}
        <circle cx="90" cy="40" r="6" fill="#065f46" stroke="#10b981" strokeWidth="1" />
        <circle cx="90" cy="25" r="5" fill="#065f46" stroke="#10b981" strokeWidth="1" />
        {/* Trees */}
        <circle cx="8" cy="14" r="5" fill="#166534" />
        <circle cx="14" cy="10" r="4" fill="#15803d" />
        <circle cx="4" cy="12" r="3" fill="#14532d" />
      </svg>
    ),
  },
  {
    id: "traffic",
    title: "Traffic Light Control System",
    subtitle: "SNMP/NTCIP — Urban Gridlock",
    description:
      "Exploit weak SNMP community strings to manipulate traffic signal controllers. Cause gridlock, abuse emergency preemption, and bypass conflict monitors.",
    status: "active" as const,
    gradient: "from-amber-900 via-orange-900 to-red-900",
    border: "border-amber-700",
    icon: (
      <svg viewBox="0 0 100 60" className="w-full h-full">
        {/* Road */}
        <rect x="40" y="0" width="20" height="60" fill="#374151" />
        <rect x="0" y="25" width="100" height="15" fill="#374151" />
        {/* Road lines */}
        <line x1="50" y1="0" x2="50" y2="22" stroke="#fbbf24" strokeWidth="1" strokeDasharray="4 3" />
        <line x1="50" y1="42" x2="50" y2="60" stroke="#fbbf24" strokeWidth="1" strokeDasharray="4 3" />
        {/* Traffic light pole */}
        <rect x="65" y="8" width="3" height="16" fill="#6b7280" />
        <rect x="62" y="4" width="9" height="14" rx="2" fill="#1f2937" stroke="#6b7280" strokeWidth="0.5" />
        <circle cx="66.5" cy="7" r="1.8" fill="#ef4444" />
        <circle cx="66.5" cy="11" r="1.8" fill="#fbbf24" opacity="0.3" />
        <circle cx="66.5" cy="15" r="1.8" fill="#22c55e" opacity="0.3" />
        {/* Second traffic light */}
        <rect x="30" y="42" width="3" height="12" fill="#6b7280" />
        <rect x="27" y="42" width="9" height="14" rx="2" fill="#1f2937" stroke="#6b7280" strokeWidth="0.5" />
        <circle cx="31.5" cy="45" r="1.8" fill="#ef4444" opacity="0.3" />
        <circle cx="31.5" cy="49" r="1.8" fill="#fbbf24" opacity="0.3" />
        <circle cx="31.5" cy="53" r="1.8" fill="#22c55e" />
        {/* Cars */}
        <rect x="44" y="2" width="4" height="6" rx="1" fill="#60a5fa" opacity="0.7" />
        <rect x="44" y="10" width="4" height="6" rx="1" fill="#a78bfa" opacity="0.7" />
        <rect x="10" y="29" width="6" height="4" rx="1" fill="#f97316" opacity="0.7" />
      </svg>
    ),
  },
  {
    id: "powergrid",
    title: "Power Grid Substation",
    subtitle: "IEC 60870-5-104 — Blackout Scenario",
    description:
      "Take control of a 230/115kV regional substation. Trip circuit breakers, overload transformers, disable protection relays, and execute the Industroyer cascade blackout pattern.",
    status: "active" as const,
    gradient: "from-yellow-900 via-amber-900 to-orange-900",
    border: "border-yellow-700",
    icon: (
      <svg viewBox="-5 -10 110 80" className="w-full h-full">
        {/* HV Bus */}
        <rect x="5" y="14" width="90" height="4" rx="2" fill="#f59e0b" opacity="0.9" />
        {/* LV Bus */}
        <rect x="10" y="44" width="80" height="3" rx="1" fill="#60a5fa" opacity="0.8" />
        {/* Source 1 line */}
        <line x1="20" y1="4" x2="20" y2="14" stroke="#22c55e" strokeWidth="1.5" />
        <rect x="16" y="4" width="8" height="6" rx="1" fill="#166534" stroke="#22c55e" strokeWidth="0.8" />
        {/* Source 2 line */}
        <line x1="80" y1="4" x2="80" y2="14" stroke="#22c55e" strokeWidth="1.5" />
        <rect x="76" y="4" width="8" height="6" rx="1" fill="#166534" stroke="#22c55e" strokeWidth="0.8" />
        {/* TX1 */}
        <line x1="35" y1="18" x2="35" y2="25" stroke="#f59e0b" strokeWidth="1.5" />
        <circle cx="35" cy="28" r="5" fill="none" stroke="#f59e0b" strokeWidth="1.5" opacity="0.9" />
        <circle cx="35" cy="37" r="5" fill="none" stroke="#60a5fa" strokeWidth="1.5" opacity="0.9" />
        <line x1="35" y1="42" x2="35" y2="47" stroke="#60a5fa" strokeWidth="1.5" />
        {/* TX2 */}
        <line x1="65" y1="18" x2="65" y2="25" stroke="#f59e0b" strokeWidth="1.5" />
        <circle cx="65" cy="28" r="5" fill="none" stroke="#f59e0b" strokeWidth="1.5" opacity="0.9" />
        <circle cx="65" cy="37" r="5" fill="none" stroke="#60a5fa" strokeWidth="1.5" opacity="0.9" />
        <line x1="65" y1="42" x2="65" y2="47" stroke="#60a5fa" strokeWidth="1.5" />
        {/* Feeders */}
        <line x1="22" y1="47" x2="22" y2="56" stroke="#22c55e" strokeWidth="1.2" />
        <line x1="50" y1="47" x2="50" y2="56" stroke="#22c55e" strokeWidth="1.2" />
        <line x1="78" y1="47" x2="78" y2="56" stroke="#22c55e" strokeWidth="1.2" />
        {/* CB symbols */}
        <rect x="31" y="19" width="8" height="6" rx="1" fill="#374151" stroke="#f59e0b" strokeWidth="0.8" />
        <rect x="61" y="19" width="8" height="6" rx="1" fill="#374151" stroke="#f59e0b" strokeWidth="0.8" />
        <rect x="18" y="48" width="8" height="5" rx="1" fill="#374151" stroke="#60a5fa" strokeWidth="0.8" />
        <rect x="46" y="48" width="8" height="5" rx="1" fill="#374151" stroke="#60a5fa" strokeWidth="0.8" />
        <rect x="74" y="48" width="8" height="5" rx="1" fill="#374151" stroke="#60a5fa" strokeWidth="0.8" />
        {/* Lightning flash */}
        <polygon points="50,8 54,8 51,14 55,14 48,22 52,16 48,16" fill="#fbbf24" opacity="0.85" />
      </svg>
    ),
  },
  {
    id: "pipeline",
    title: "Redwater Compressor Station",
    subtitle: "Modbus — Pipeline Overpressure & Deception",
    description:
      "Breach a gas pipeline compressor station's Modbus RTU. Bypass the electronic safety system and mechanical relief valve, then use false-data injection to hide a catastrophic overpressure rupture from the operator HMI.",
    status: "active" as const,
    gradient: "from-orange-950 via-stone-900 to-red-950",
    border: "border-orange-800",
    icon: (
      <svg viewBox="0 0 100 60" className="w-full h-full">
        {/* Pipeline */}
        <rect x="0" y="38" width="100" height="6" fill="#78350f" opacity="0.8" />
        {/* Compressor housing */}
        <circle cx="45" cy="32" r="13" fill="none" stroke="#fb923c" strokeWidth="2" />
        <line x1="45" y1="32" x2="53" y2="26" stroke="#fb923c" strokeWidth="1.5" />
        <line x1="45" y1="32" x2="37" y2="26" stroke="#fb923c" strokeWidth="1.5" opacity="0.6" />
        <line x1="45" y1="32" x2="53" y2="38" stroke="#fb923c" strokeWidth="1.5" opacity="0.6" />
        {/* Vent stacks */}
        <line x1="65" y1="16" x2="65" y2="38" stroke="#6b7280" strokeWidth="2" />
        <circle cx="65" cy="12" r="3" fill="#f97316" opacity="0.8" />
        <circle cx="65" cy="9" r="1.8" fill="#fbbf24" opacity="0.9" />
        <line x1="80" y1="20" x2="80" y2="38" stroke="#6b7280" strokeWidth="2" />
        {/* Valves */}
        <rect x="16" y="34" width="7" height="8" fill="#374151" stroke="#22c55e" strokeWidth="0.8" />
        <rect x="86" y="34" width="7" height="8" fill="#374151" stroke="#ef4444" strokeWidth="0.8" />
        {/* Gauge */}
        <circle cx="45" cy="50" r="4" fill="none" stroke="#f59e0b" strokeWidth="1" />
      </svg>
    ),
  },
  {
    id: "lift",
    title: "Cedar Creek Lift Station 7",
    subtitle: "Serial Gateway — Denial of Control",
    description:
      "Take down a remote wastewater lift station by flooding its legacy serial-to-Ethernet gateway. The flood starves the controller, the pump loses control, and the wet well overflows while the operator's HMI freezes on stale data.",
    status: "active" as const,
    gradient: "from-teal-950 via-slate-900 to-emerald-950",
    border: "border-teal-800",
    icon: (
      <svg viewBox="0 0 100 60" className="w-full h-full">
        {/* Wet well */}
        <rect x="18" y="20" width="34" height="34" rx="2" fill="#0f766e" opacity="0.35" stroke="#2dd4bf" strokeWidth="1" />
        <rect x="18" y="34" width="34" height="20" rx="2" fill="#14b8a6" opacity="0.5" />
        {/* Inflow pipe */}
        <rect x="0" y="24" width="18" height="5" fill="#475569" />
        <path d="M 4 26.5 L 10 26.5" stroke="#2dd4bf" strokeWidth="1" opacity="0.8" />
        {/* Pump + force main rising */}
        <circle cx="35" cy="46" r="4" fill="#134e4a" stroke="#5eead4" strokeWidth="1" />
        <rect x="52" y="14" width="5" height="34" fill="#475569" />
        <rect x="35" y="14" width="22" height="5" fill="#475569" />
        {/* Overflow warning spill */}
        <path d="M 18 20 Q 14 16 12 20 Q 10 24 14 24" fill="none" stroke="#f59e0b" strokeWidth="1.2" opacity="0.7" />
        {/* Gateway / antenna (the weak point) */}
        <rect x="70" y="30" width="12" height="9" rx="1" fill="#1f2937" stroke="#5eead4" strokeWidth="0.8" />
        <line x1="76" y1="30" x2="76" y2="22" stroke="#5eead4" strokeWidth="1" />
        <circle cx="76" cy="21" r="1.5" fill="#f87171" />
        {/* flood packets hitting the gateway */}
        <circle cx="88" cy="34" r="1" fill="#ef4444" />
        <circle cx="92" cy="31" r="1" fill="#ef4444" opacity="0.7" />
        <circle cx="90" cy="37" r="1" fill="#ef4444" opacity="0.5" />
      </svg>
    ),
  },
];

export function CityView({ onSelectScenario }: CityViewProps) {
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <div className="border-b border-gray-800 bg-gray-900">
        <div className="max-w-6xl mx-auto px-6 py-6">
          <div className="flex items-center gap-3 mb-2">
            <img
              src="/cybercity-logo.jpg"
              alt="CyberCity ICS/OT"
              className="w-14 h-14 rounded-lg object-cover border border-gray-700 shadow-lg shadow-blue-900/30"
            />
            <div>
              <h1 className="text-2xl font-mono font-bold text-gray-100">
                CyberCity ICS/OT
              </h1>
              <p className="text-sm font-mono text-gray-500">
                Industrial Control Systems/Operational Technology Cybersecurity Training
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* City Overview */}
      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h2 className="text-lg font-mono font-bold text-gray-300 mb-1">
            TRAINING SCENARIOS
          </h2>
          <p className="text-sm font-mono text-gray-600">
            Select a facility to begin your ICS/OT security assessment
          </p>
        </div>

        {/* Scenario Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {SCENARIOS.map((scenario) => {
            const isActive = scenario.status === "active";
            return (
              <button
                key={scenario.id}
                onClick={() => isActive && onSelectScenario(scenario.id)}
                disabled={!isActive}
                className={`text-left rounded-xl border overflow-hidden transition-all duration-200 ${
                  isActive
                    ? `${scenario.border} hover:border-blue-500 hover:shadow-lg hover:shadow-blue-900/20 hover:-translate-y-1 cursor-pointer`
                    : "border-gray-800 cursor-not-allowed opacity-60"
                }`}
              >
                {/* Visual area */}
                <div
                  className={`h-32 bg-gradient-to-br ${scenario.gradient} p-4 relative`}
                >
                  <div className="absolute inset-0 p-4">
                    {scenario.icon}
                  </div>
                  {/* Status badge */}
                  <div className="absolute top-3 right-3">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                        isActive
                          ? "bg-green-900/80 text-green-300 border border-green-700"
                          : "bg-gray-700/80 text-gray-400 border border-gray-600"
                      }`}
                    >
                      {isActive ? "ACTIVE" : "COMING SOON"}
                    </span>
                  </div>
                </div>

                {/* Info area */}
                <div className="bg-gray-900 p-4">
                  <h3
                    className={`font-mono font-bold text-sm mb-1 ${
                      isActive ? "text-gray-200" : "text-gray-500"
                    }`}
                  >
                    {scenario.title}
                  </h3>
                  <p
                    className={`font-mono text-xs mb-3 ${
                      isActive ? "text-cyan-400" : "text-gray-600"
                    }`}
                  >
                    {scenario.subtitle}
                  </p>
                  <p
                    className={`text-xs leading-relaxed ${
                      isActive ? "text-gray-400" : "text-gray-600"
                    }`}
                  >
                    {scenario.description}
                  </p>
                  {isActive && (
                    <div className="mt-4 flex items-center gap-1 text-xs font-mono text-blue-400">
                      <span>Enter Scenario</span>
                      <span>&rarr;</span>
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
