import { Component, type ReactNode, type ErrorInfo } from "react";
import { Routes, Route, Navigate, useNavigate, useParams } from "react-router-dom";
import { useProcessData } from "./hooks/useProcessData";
import { DamView } from "./components/dam/DamView";
import { TreatmentView } from "./components/treatment/TreatmentView";
import { ControlRoom } from "./components/controlroom/ControlRoom";
import { AttackConsole } from "./components/attack/AttackConsole";
import { IntersectionView } from "./components/traffic/IntersectionView";
import { TrafficControlRoom } from "./components/traffic/TrafficControlRoom";
import { TrafficLabMonitor } from "./components/traffic/TrafficLabMonitor";
import { SubstationView } from "./components/grid/SubstationView";
import { GridControlRoom } from "./components/grid/GridControlRoom";
import { GridLabMonitor } from "./components/grid/GridLabMonitor";
import { CompressorStationView } from "./components/pipeline/CompressorStationView";
import { PipelineControlRoom } from "./components/pipeline/PipelineControlRoom";
import { PipelineLabMonitor } from "./components/pipeline/PipelineLabMonitor";
import { LiftStationView } from "./components/lift/LiftStationView";
import { LiftControlRoom } from "./components/lift/LiftControlRoom";
import { LiftLabMonitor } from "./components/lift/LiftLabMonitor";
import { CityView } from "./components/city/CityView";

type DamView_ = "dam" | "treatment" | "controlroom" | "attack";
type TrafficView = "intersection" | "controlroom" | "lab";
type GridView = "substation" | "controlroom" | "lab";
type PipelineView_ = "station" | "controlroom" | "lab";
type LiftView_ = "station" | "controlroom" | "lab";
type Scenario = "dam" | "traffic" | "powergrid" | "pipeline" | "lift";

const SCENARIOS: Scenario[] = ["dam", "traffic", "powergrid", "pipeline", "lift"];

const DEFAULT_VIEW: Record<Scenario, string> = {
  dam: "dam",
  traffic: "intersection",
  powergrid: "substation",
  pipeline: "station",
  lift: "station",
};

const DAM_NAV: { id: DamView_; label: string; color: string }[] = [
  { id: "dam", label: "Dam Overview", color: "text-blue-400" },
  { id: "treatment", label: "Treatment Plant", color: "text-cyan-400" },
  { id: "controlroom", label: "Control Room", color: "text-green-400" },
  { id: "attack", label: "Lab Monitor", color: "text-red-400" },
];

const TRAFFIC_NAV: { id: TrafficView; label: string; color: string }[] = [
  { id: "intersection", label: "Intersection", color: "text-amber-400" },
  { id: "controlroom", label: "Control Room", color: "text-green-400" },
  { id: "lab", label: "Lab Monitor", color: "text-red-400" },
];

const GRID_NAV: { id: GridView; label: string; color: string }[] = [
  { id: "substation", label: "Substation SLD", color: "text-yellow-400" },
  { id: "controlroom", label: "Control Room", color: "text-green-400" },
  { id: "lab", label: "Lab Monitor", color: "text-red-400" },
];

const PIPELINE_NAV: { id: PipelineView_; label: string; color: string }[] = [
  { id: "station", label: "Station View", color: "text-orange-400" },
  { id: "controlroom", label: "Control Room", color: "text-green-400" },
  { id: "lab", label: "Lab Monitor", color: "text-red-400" },
];

const LIFT_NAV: { id: LiftView_; label: string; color: string }[] = [
  { id: "station", label: "Station View", color: "text-teal-400" },
  { id: "controlroom", label: "Control Room", color: "text-green-400" },
  { id: "lab", label: "Lab Monitor", color: "text-red-400" },
];

// Error boundary to catch rendering crashes
class ErrorBoundary extends Component<
  { children: ReactNode; name: string },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[ErrorBoundary:${this.props.name}]`, error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="bg-red-900/30 border border-red-600 rounded p-4 m-4 font-mono text-sm">
          <div className="text-red-400 font-bold mb-2">
            Component Crash: {this.props.name}
          </div>
          <pre className="text-red-300 text-xs whitespace-pre-wrap">
            {this.state.error.message}
            {"\n"}
            {this.state.error.stack}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

type ProcessData = ReturnType<typeof useProcessData>;

function ScenarioShell({ displayed, actual, connected, sendCommand }: ProcessData) {
  const { scenario, view } = useParams<{ scenario: string; view: string }>();
  const navigate = useNavigate();

  if (!scenario || !SCENARIOS.includes(scenario as Scenario)) {
    return <Navigate to="/" replace />;
  }
  const currentScreen = scenario as Scenario;

  const isDam      = currentScreen === "dam";
  const isTraffic  = currentScreen === "traffic";
  const isGrid     = currentScreen === "powergrid";
  const isPipeline = currentScreen === "pipeline";
  const isLift     = currentScreen === "lift";

  const damView      = (DAM_NAV.some(n => n.id === view) ? view : "dam") as DamView_;
  const trafficView  = (TRAFFIC_NAV.some(n => n.id === view) ? view : "intersection") as TrafficView;
  const gridView     = (GRID_NAV.some(n => n.id === view) ? view : "substation") as GridView;
  const pipelineView = (PIPELINE_NAV.some(n => n.id === view) ? view : "station") as PipelineView_;
  const liftView     = (LIFT_NAV.some(n => n.id === view) ? view : "station") as LiftView_;

  const scenarioLabel = isDam ? "HydraGuard" : isTraffic ? "MetroGrid" :
    isGrid ? "Copperline Substation" : isPipeline ? "Redwater Compressor Station" :
    "Cedar Creek Lift Station 7";
  const scenarioIcon  = isDam ? "HG" : isTraffic ? "MG" : isGrid ? "PS" : isPipeline ? "CS" : "LS";
  const scenarioBg    = isDam ? "bg-blue-600" : isTraffic ? "bg-amber-600" : isGrid ? "bg-yellow-600" :
    isPipeline ? "bg-orange-600" : "bg-teal-600";

  return (
    <ErrorBoundary name="ScenarioShell">
    <div className="min-h-screen bg-gray-950">
      {/* Navigation Bar */}
      <nav className="bg-gray-900 border-b border-gray-800 px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-4">
          {/* Back to city */}
          <button
            onClick={() => navigate("/")}
            className="text-gray-500 hover:text-gray-300 font-mono text-xs px-2 py-1 rounded hover:bg-gray-800 transition-colors"
            title="Back to City"
          >
            &larr;
          </button>

          {/* Logo */}
          <div className="flex items-center gap-2">
            <div
              className={`w-8 h-8 ${scenarioBg} rounded flex items-center justify-center text-white font-bold text-sm`}
            >
              {scenarioIcon}
            </div>
            <span className="font-mono font-bold text-gray-200 text-sm">
              {scenarioLabel}
            </span>
          </div>

          {/* View tabs */}
          <div className="flex gap-1 ml-4">
            {isDam &&
              DAM_NAV.map((item) => (
                <button
                  key={item.id}
                  onClick={() => navigate(`/dam/${item.id}`)}
                  className={`px-3 py-1.5 rounded font-mono text-xs transition-colors ${
                    damView === item.id
                      ? `bg-gray-800 ${item.color} border border-gray-700`
                      : "text-gray-500 hover:text-gray-300 hover:bg-gray-800/50"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            {isTraffic &&
              TRAFFIC_NAV.map((item) => (
                <button
                  key={item.id}
                  onClick={() => navigate(`/traffic/${item.id}`)}
                  className={`px-3 py-1.5 rounded font-mono text-xs transition-colors ${
                    trafficView === item.id
                      ? `bg-gray-800 ${item.color} border border-gray-700`
                      : "text-gray-500 hover:text-gray-300 hover:bg-gray-800/50"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            {isGrid &&
              GRID_NAV.map((item) => (
                <button
                  key={item.id}
                  onClick={() => navigate(`/powergrid/${item.id}`)}
                  className={`px-3 py-1.5 rounded font-mono text-xs transition-colors ${
                    gridView === item.id
                      ? `bg-gray-800 ${item.color} border border-gray-700`
                      : "text-gray-500 hover:text-gray-300 hover:bg-gray-800/50"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            {isPipeline &&
              PIPELINE_NAV.map((item) => (
                <button
                  key={item.id}
                  onClick={() => navigate(`/pipeline/${item.id}`)}
                  className={`px-3 py-1.5 rounded font-mono text-xs transition-colors ${
                    pipelineView === item.id
                      ? `bg-gray-800 ${item.color} border border-gray-700`
                      : "text-gray-500 hover:text-gray-300 hover:bg-gray-800/50"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            {isLift &&
              LIFT_NAV.map((item) => (
                <button
                  key={item.id}
                  onClick={() => navigate(`/lift/${item.id}`)}
                  className={`px-3 py-1.5 rounded font-mono text-xs transition-colors ${
                    liftView === item.id
                      ? `bg-gray-800 ${item.color} border border-gray-700`
                      : "text-gray-500 hover:text-gray-300 hover:bg-gray-800/50"
                  }`}
                >
                  {item.label}
                </button>
              ))}
          </div>
        </div>

        {/* Status indicators */}
        <div className="flex items-center gap-4 text-xs font-mono">
          <div className="flex items-center gap-1.5">
            <div
              className={`w-2 h-2 rounded-full ${
                connected ? "bg-green-500" : "bg-red-500 animate-pulse"
              }`}
            />
            <span className={connected ? "text-green-400" : "text-red-400"}>
              {connected ? "CONNECTED" : "DISCONNECTED"}
            </span>
          </div>
          <div className="text-gray-600">
            Tick: {actual.tick}
          </div>
        </div>
      </nav>

      {/* Main Content — all views stay mounted so trend data accumulates */}
      <main className="p-2">
        {/* Dam Scenario Views */}
        {isDam && (
          <>
            <div style={{ display: damView === "dam" ? "block" : "none" }}>
              <DamView dam={displayed.dam} />
            </div>
            <div style={{ display: damView === "treatment" ? "block" : "none" }}>
              <TreatmentView plant={displayed.plant} />
            </div>
            <div style={{ display: damView === "controlroom" ? "block" : "none" }}>
              <ControlRoom state={displayed} sendCommand={sendCommand} />
            </div>
            <div style={{ display: damView === "attack" ? "block" : "none" }}>
              <AttackConsole displayed={displayed} actual={actual} />
            </div>
          </>
        )}

        {/* Traffic Scenario Views */}
        {isTraffic && (
          <>
            <div style={{ display: trafficView === "intersection" ? "block" : "none" }}>
              <ErrorBoundary name="IntersectionView">
                <IntersectionView traffic={displayed.traffic} />
              </ErrorBoundary>
            </div>
            <div style={{ display: trafficView === "controlroom" ? "block" : "none" }}>
              <ErrorBoundary name="TrafficControlRoom">
                <TrafficControlRoom state={displayed} sendCommand={sendCommand} />
              </ErrorBoundary>
            </div>
            <div style={{ display: trafficView === "lab" ? "block" : "none" }}>
              <ErrorBoundary name="TrafficLabMonitor">
                <TrafficLabMonitor displayed={displayed} actual={actual} />
              </ErrorBoundary>
            </div>
          </>
        )}

        {/* Power Grid Scenario Views */}
        {isGrid && (
          <>
            <div style={{ display: gridView === "substation" ? "block" : "none" }}>
              <ErrorBoundary name="SubstationView">
                <SubstationView grid={displayed.grid} />
              </ErrorBoundary>
            </div>
            <div style={{ display: gridView === "controlroom" ? "block" : "none" }}>
              <ErrorBoundary name="GridControlRoom">
                <GridControlRoom state={displayed} sendCommand={sendCommand} />
              </ErrorBoundary>
            </div>
            <div style={{ display: gridView === "lab" ? "block" : "none" }}>
              <ErrorBoundary name="GridLabMonitor">
                <GridLabMonitor displayed={displayed} actual={actual} />
              </ErrorBoundary>
            </div>
          </>
        )}

        {/* Pipeline Compressor Station Scenario Views */}
        {isPipeline && (
          <>
            <div style={{ display: pipelineView === "station" ? "block" : "none" }}>
              <ErrorBoundary name="CompressorStationView">
                <CompressorStationView pipeline={displayed.pipeline} />
              </ErrorBoundary>
            </div>
            <div style={{ display: pipelineView === "controlroom" ? "block" : "none" }}>
              <ErrorBoundary name="PipelineControlRoom">
                <PipelineControlRoom state={displayed} sendCommand={sendCommand} />
              </ErrorBoundary>
            </div>
            <div style={{ display: pipelineView === "lab" ? "block" : "none" }}>
              <ErrorBoundary name="PipelineLabMonitor">
                <PipelineLabMonitor displayed={displayed} actual={actual} />
              </ErrorBoundary>
            </div>
          </>
        )}

        {/* Wastewater Lift Station Scenario Views */}
        {isLift && (
          <>
            <div style={{ display: liftView === "station" ? "block" : "none" }}>
              <ErrorBoundary name="LiftStationView">
                <LiftStationView lift={displayed.lift} />
              </ErrorBoundary>
            </div>
            <div style={{ display: liftView === "controlroom" ? "block" : "none" }}>
              <ErrorBoundary name="LiftControlRoom">
                <LiftControlRoom state={displayed} sendCommand={sendCommand} />
              </ErrorBoundary>
            </div>
            <div style={{ display: liftView === "lab" ? "block" : "none" }}>
              <ErrorBoundary name="LiftLabMonitor">
                <LiftLabMonitor displayed={displayed} actual={actual} />
              </ErrorBoundary>
            </div>
          </>
        )}
      </main>
    </div>
    </ErrorBoundary>
  );
}

function App() {
  const processData = useProcessData();
  const navigate = useNavigate();

  return (
    <Routes>
      <Route
        path="/"
        element={
          <CityView
            onSelectScenario={(id) => navigate(`/${id}/${DEFAULT_VIEW[id as Scenario]}`)}
          />
        }
      />
      <Route path="/:scenario/:view" element={<ScenarioShell {...processData} />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
