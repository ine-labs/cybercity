import { Stage, Layer, Rect, Line, Text, Group, Circle } from "react-konva";
import { useState, useEffect, useRef } from "react";
import { Gauge } from "../shared/Gauge";
import { StatusLight } from "../shared/StatusLight";
import type { PlantState, StageStatus } from "../../types/process";

interface TreatmentViewProps {
  plant: PlantState;
}

const STAGE_COLORS: Record<StageStatus, string> = {
  0: "#6b7280", // offline - gray
  1: "#22c55e", // normal - green
  2: "#eab308", // warning - yellow
  3: "#ef4444", // critical - red
};

const STAGE_LABELS: Record<StageStatus, string> = {
  0: "OFFLINE",
  1: "NORMAL",
  2: "WARNING",
  3: "CRITICAL",
};

/**
 * Measure the container so the scene can be reflowed to the real canvas size:
 * full width, and height locked to the remaining viewport (so it never scrolls).
 */
function useContainerBox<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      if (el.clientWidth === 0) return; // hidden tab — skip
      setBox({
        w: el.clientWidth,
        h: Math.max(320, window.innerHeight - rect.top - 8),
      });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener("resize", update);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);
  return [ref, box] as const;
}

function TreatmentStage({
  x,
  y,
  width,
  height,
  name,
  status,
  fillLevel,
  fillColor,
  s,
}: {
  x: number;
  y: number;
  width: number;
  height: number;
  name: string;
  status: StageStatus;
  fillLevel?: number;
  fillColor?: string;
  s: number;
}) {
  const stageColor = STAGE_COLORS[status];
  const fill = fillLevel !== undefined ? fillLevel / 100 : 0;

  return (
    <Group x={x} y={y}>
      {/* Tank body */}
      <Rect
        width={width}
        height={height}
        fill="#1e293b"
        stroke={stageColor}
        strokeWidth={2 * s}
        cornerRadius={4 * s}
      />
      {/* Fill level */}
      {fillLevel !== undefined && (
        <Rect
          x={2 * s}
          y={height - fill * (height - 4 * s)}
          width={width - 4 * s}
          height={fill * (height - 4 * s)}
          fill={fillColor || "#3b82f6"}
          opacity={0.6}
          cornerRadius={2 * s}
        />
      )}
      {/* Stage name */}
      <Text
        text={name}
        x={0}
        y={-20 * s}
        width={width}
        fontSize={10 * s}
        fill="#d1d5db"
        fontFamily="monospace"
        align="center"
      />
      {/* Status badge */}
      <Group x={width / 2} y={height + 8 * s}>
        <Circle radius={4 * s} fill={stageColor} />
        <Text
          text={STAGE_LABELS[status]}
          x={8 * s}
          y={-5 * s}
          fontSize={8 * s}
          fill={stageColor}
          fontFamily="monospace"
        />
      </Group>
    </Group>
  );
}

function PipeConnection({
  x1,
  y1,
  x2,
  y2,
  active,
  s,
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  active: boolean;
  s: number;
}) {
  return (
    <Group>
      <Line
        points={[x1, y1, x2, y2]}
        stroke={active ? "#3b82f6" : "#374151"}
        strokeWidth={4 * s}
      />
      {/* Flow direction arrow */}
      {active && (
        <Group x={(x1 + x2) / 2} y={(y1 + y2) / 2}>
          <Text
            text="▶"
            fontSize={10 * s}
            fill="#60a5fa"
            x={-5 * s}
            y={-6 * s}
          />
        </Group>
      )}
    </Group>
  );
}

function PumpIndicator({
  x,
  y,
  name,
  active,
  s,
}: {
  x: number;
  y: number;
  name: string;
  active: boolean;
  s: number;
}) {
  return (
    <Group x={x} y={y}>
      <Circle
        radius={12 * s}
        fill={active ? "#1e3a5f" : "#1e293b"}
        stroke={active ? "#3b82f6" : "#6b7280"}
        strokeWidth={2 * s}
      />
      <Text
        text={active ? "▶" : "■"}
        fontSize={10 * s}
        fill={active ? "#60a5fa" : "#6b7280"}
        x={-4 * s}
        y={-5 * s}
      />
      <Text
        text={name}
        fontSize={9 * s}
        fill={active ? "#93c5fd" : "#6b7280"}
        fontFamily="monospace"
        x={-20 * s}
        y={18 * s}
        width={40 * s}
        align="center"
      />
    </Group>
  );
}

// Native design space — authored here, then mapped onto the live canvas.
// Positions fill the full area (X/Y); circles, gauges and text scale
// uniformly (S) so nothing ever looks stretched.
const DW = 900;
const DH = 550;

export function TreatmentView({ plant }: TreatmentViewProps) {
  const [wrapRef, box] = useContainerBox<HTMLDivElement>();
  const W = box.w || DW;
  const H = box.h || DH;

  const sx = W / DW;
  const sy = H / DH;
  const k = Math.min(sx, sy);
  const X = (v: number) => v * sx; // horizontal position / length
  const Y = (v: number) => v * sy; // vertical position / length
  const S = (v: number) => v * k;  // uniform size (radius, font, stroke)

  // Layout (design space)
  const stageY = 180;
  const stageW = 90;
  const stageH = 120;
  const stageGap = 30;
  const startX = 40;

  const stageNames = [
    "INTAKE",
    "COAGULATION",
    "SEDIMENTATION",
    "FILTRATION",
    "CHLORINATION",
    "DISTRIBUTION",
  ];
  const stageKeys = [
    "intake",
    "coagulation",
    "sedimentation",
    "filtration",
    "chlorination",
    "distribution",
  ];

  // Chlorine color: more chlorine = more yellow-green
  const chlorineIntensity = Math.min(1, plant.chlorine_level / 10);
  const chlorineColor = `rgb(${Math.round(34 + chlorineIntensity * 200)}, ${Math.round(197 - chlorineIntensity * 100)}, ${Math.round(94 - chlorineIntensity * 60)})`;

  const anyAlarm = plant.chemical_alarm || plant.pressure_alarm || plant.turbidity_alarm;

  return (
    <div ref={wrapRef} className="w-full">
      <Stage width={W} height={H}>
        <Layer>
          {/* Background */}
          <Rect
            width={W}
            height={H}
            fill={anyAlarm ? "#1a0a05" : "#0f172a"}
          />

          {/* Title */}
          <Text
            text="WATER TREATMENT PLANT"
            x={X(20)}
            y={Y(15)}
            fontSize={S(18)}
            fill="#e2e8f0"
            fontFamily="monospace"
            fontStyle="bold"
          />
          <Text
            text={anyAlarm ? "! ALARM ACTIVE !" : "NORMAL OPERATION"}
            x={X(20)}
            y={Y(38)}
            fontSize={S(13)}
            fill={anyAlarm ? "#ef4444" : "#22c55e"}
            fontFamily="monospace"
          />

          {/* ← From Dam label */}
          <Text
            text="← From Dam"
            x={X(startX)}
            y={Y(stageY - 40)}
            fontSize={S(11)}
            fill="#60a5fa"
            fontFamily="monospace"
          />

          {/* Treatment stages */}
          {stageNames.map((name, i) => {
            const x = X(startX + i * (stageW + stageGap));
            const status = (plant.stages[stageKeys[i]] ?? 1) as StageStatus;
            let fillLevel: number | undefined;
            let fillColor: string | undefined;

            if (i === 0) {
              fillLevel = Math.min(100, plant.intake_rate / 2);
              fillColor = "#3b82f6";
            } else if (i === 4) {
              fillLevel = 70;
              fillColor = chlorineColor;
            } else if (i === 5) {
              fillLevel = plant.tank_level;
              fillColor = "#3b82f6";
            } else {
              // Coag / sed / filt basins: animated only while water is actually
              // flowing in (intake_rate > 0). Go static when the plant is starved,
              // whether from the intake pump being off OR the dam sluice gate
              // being closed (dam outflow = 0 => intake_rate = 0).
              fillLevel = plant.intake_rate > 0 ? 50 + Math.random() * 10 : 55;
              fillColor = "#3b82f6";
            }

            return (
              <TreatmentStage
                key={name}
                x={x}
                y={Y(stageY)}
                width={X(stageW)}
                height={Y(stageH)}
                name={name}
                status={status}
                fillLevel={fillLevel}
                fillColor={fillColor}
                s={k}
              />
            );
          })}

          {/* Pipe connections between stages */}
          {stageNames.slice(0, -1).map((_, i) => {
            const x1 = X(startX + i * (stageW + stageGap) + stageW);
            const x2 = X(startX + (i + 1) * (stageW + stageGap));
            return (
              <PipeConnection
                key={`pipe-${i}`}
                x1={x1}
                y1={Y(stageY + stageH / 2)}
                x2={x2}
                y2={Y(stageY + stageH / 2)}
                active={(plant.stages[stageKeys[i]] as StageStatus) >= 1}
                s={k}
              />
            );
          })}

          {/* → To City label */}
          <Text
            text="To City →"
            x={X(startX + 5 * (stageW + stageGap) + stageW + 10)}
            y={Y(stageY + stageH / 2 - 6)}
            fontSize={S(11)}
            fill="#22c55e"
            fontFamily="monospace"
          />

          {/* Pump indicators */}
          <PumpIndicator
            x={X(startX + stageW / 2)}
            y={Y(stageY + stageH + 45)}
            name="INTAKE"
            active={plant.intake_pump}
            s={k}
          />
          <PumpIndicator
            x={X(startX + 4 * (stageW + stageGap) + stageW / 2)}
            y={Y(stageY + stageH + 45)}
            name="CHEM"
            active={plant.chemical_pump}
            s={k}
          />
          <PumpIndicator
            x={X(startX + 5 * (stageW + stageGap) + stageW / 2)}
            y={Y(stageY + stageH + 45)}
            name="DIST"
            active={plant.distribution_pump}
            s={k}
          />

          {/* ── Gauges ── */}
          <Gauge
            x={X(100)}
            y={Y(440)}
            radius={S(45)}
            value={plant.chlorine_level}
            min={0}
            max={15}
            label="Chlorine"
            unit="ppm"
            dangerHigh={8}
            dangerLow={0.5}
          />
          <Gauge
            x={X(230)}
            y={Y(440)}
            radius={S(45)}
            value={plant.ph_level}
            min={0}
            max={14}
            label="pH Level"
            unit="pH"
            dangerHigh={8.5}
            dangerLow={6.5}
          />
          <Gauge
            x={X(360)}
            y={Y(440)}
            radius={S(45)}
            value={plant.turbidity}
            min={0}
            max={10}
            label="Turbidity"
            unit="NTU"
            dangerHigh={5}
          />
          <Gauge
            x={X(490)}
            y={Y(440)}
            radius={S(45)}
            value={plant.tank_level}
            min={0}
            max={100}
            label="Tank Level"
            unit="%"
            dangerHigh={90}
            dangerLow={10}
          />
          <Gauge
            x={X(620)}
            y={Y(440)}
            radius={S(45)}
            value={plant.distribution_pressure}
            min={0}
            max={100}
            label="Pressure"
            unit="PSI"
            dangerHigh={80}
            dangerLow={40}
          />

          {/* ── Alarms (top right) ── */}
          <Text
            text="ALARMS"
            x={X(740)}
            y={Y(20)}
            fontSize={S(12)}
            fill="#9ca3af"
            fontFamily="monospace"
            fontStyle="bold"
          />
          <StatusLight
            x={X(740)}
            y={Y(45)}
            size={S(10)}
            active={plant.chemical_alarm}
            label="CHEMICAL"
            color="#ef4444"
          />
          <StatusLight
            x={X(740)}
            y={Y(70)}
            size={S(10)}
            active={plant.pressure_alarm}
            label="PRESSURE"
            color="#f59e0b"
          />
          <StatusLight
            x={X(740)}
            y={Y(95)}
            size={S(10)}
            active={plant.turbidity_alarm}
            label="TURBIDITY"
            color="#f97316"
          />

          {/* Chemical dosing info */}
          <Text
            text={`Dosing Rate: ${plant.chlorine_dosing_rate.toFixed(1)} ppm`}
            x={X(startX + 4 * (stageW + stageGap))}
            y={Y(stageY - 40)}
            fontSize={S(11)}
            fill={plant.chlorine_level > 8 ? "#ef4444" : "#93c5fd"}
            fontFamily="monospace"
          />
        </Layer>
      </Stage>
    </div>
  );
}