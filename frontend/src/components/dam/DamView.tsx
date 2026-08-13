import { Stage, Layer, Rect, Line, Text, Group, Circle } from "react-konva";
import { useState, useEffect, useRef } from "react";
import { Gauge } from "../shared/Gauge";
import { StatusLight } from "../shared/StatusLight";
import type { DamState } from "../../types/process";

interface DamViewProps {
  dam: DamState;
}

/** Animated water particles for flow effect */
function WaterParticles({
  x,
  y,
  width,
  count,
  speed,
  active,
}: {
  x: number;
  y: number;
  width: number;
  count: number;
  speed: number;
  active: boolean;
}) {
  const [particles, setParticles] = useState<{ px: number; py: number }[]>([]);
  const frameRef = useRef(0);

  useEffect(() => {
    const initial = Array.from({ length: count }, () => ({
      px: Math.random() * width,
      py: Math.random() * 20 - 10,
    }));
    setParticles(initial);
  }, [count, width]);

  useEffect(() => {
    if (!active) return;
    const interval = setInterval(() => {
      frameRef.current += 1;
      setParticles((prev) =>
        prev.map((p) => ({
          px: (p.px + speed) % width,
          py: p.py + Math.sin(frameRef.current * 0.1 + p.px) * 0.5,
        }))
      );
    }, 50);
    return () => clearInterval(interval);
  }, [active, speed, width]);

  if (!active) return null;

  return (
    <Group x={x} y={y}>
      {particles.map((p, i) => (
        <Circle
          key={i}
          x={p.px}
          y={p.py}
          radius={2}
          fill="#60a5fa"
          opacity={0.6}
        />
      ))}
    </Group>
  );
}

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

// Native design space — every element is authored against this, then mapped
// onto the live canvas. Positions fill the full area (X/Y); circles, gauges and
// text scale uniformly (S) so nothing ever looks stretched.
const DW = 900;
const DH = 550;

export function DamView({ dam }: DamViewProps) {
  const [wrapRef, box] = useContainerBox<HTMLDivElement>();
  const W = box.w || DW;
  const H = box.h || DH;

  const sx = W / DW;
  const sy = H / DH;
  const k = Math.min(sx, sy);
  const X = (v: number) => v * sx; // horizontal position / length
  const Y = (v: number) => v * sy; // vertical position / length
  const S = (v: number) => v * k;  // uniform size (radius, font, stroke)

  // Dam structure dimensions (design space)
  const damX = 350;
  const damWidth = 30;
  const damTop = 80;
  const damBottom = 400;
  const damHeight = damBottom - damTop;

  // Water level calculation (0-100 maps to damBottom-damTop)
  const waterFraction = dam.water_level / 100;
  const waterHeight = waterFraction * damHeight;
  const waterTop = damBottom - waterHeight;

  // Gate position (0-100% open maps to visual gate height)
  const gateMaxHeight = 60;
  const gateHeight = (dam.gate_position / 100) * gateMaxHeight;

  // Colors based on state
  const waterColor =
    dam.overflow ? "#dc2626" : dam.high_level_alarm ? "#f59e0b" : "#3b82f6";
  const bgColor = dam.overflow ? "#1a0505" : "#0f172a";

  return (
    <div ref={wrapRef} className="w-full">
      <Stage width={W} height={H}>
        <Layer>
          {/* Background */}
          <Rect width={W} height={H} fill={bgColor} />

          {/* Title */}
          <Text
            text="DAM OVERVIEW"
            x={X(20)}
            y={Y(15)}
            fontSize={S(18)}
            fill="#e2e8f0"
            fontFamily="monospace"
            fontStyle="bold"
          />
          <Text
            text={dam.overflow ? "!! OVERFLOW !!" : dam.high_level_alarm ? "! HIGH LEVEL !" : "NORMAL OPERATION"}
            x={X(20)}
            y={Y(38)}
            fontSize={S(13)}
            fill={dam.overflow ? "#ef4444" : dam.high_level_alarm ? "#fbbf24" : "#22c55e"}
            fontFamily="monospace"
          />

          {/* ── Reservoir (left side of dam) ── */}
          {/* Reservoir basin shape */}
          <Line
            points={[X(50), Y(damTop), X(50), Y(damBottom + 20), X(damX), Y(damBottom + 20), X(damX), Y(damTop)]}
            stroke="#475569"
            strokeWidth={S(3)}
            closed={false}
          />

          {/* Water fill */}
          <Rect
            x={X(52)}
            y={Y(waterTop)}
            width={X(damX - 54)}
            height={Y(waterHeight + 20)}
            fill={waterColor}
            opacity={0.7}
          />

          {/* Water surface waves */}
          <Line
            points={Array.from({ length: 30 }, (_, i) => {
              const px = X(52 + (i / 29) * (damX - 54));
              const py = Y(waterTop) + Math.sin(Date.now() * 0.003 + i * 0.5) * S(2);
              return [px, py];
            }).flat()}
            stroke="#93c5fd"
            strokeWidth={S(2)}
            opacity={0.8}
          />

          {/* ── Dam wall ── */}
          <Rect
            x={X(damX)}
            y={Y(damTop)}
            width={X(damWidth)}
            height={Y(damHeight + 20)}
            fill="#64748b"
            stroke="#94a3b8"
            strokeWidth={S(2)}
          />
          {/* Dam texture lines */}
          {Array.from({ length: 8 }, (_, i) => (
            <Line
              key={`dtex-${i}`}
              points={[X(damX), Y(damTop + i * 40 + 20), X(damX + damWidth), Y(damTop + i * 40 + 20)]}
              stroke="#475569"
              strokeWidth={S(1)}
            />
          ))}

          {/* ── Sluice Gate ── */}
          <Group x={X(damX)} y={Y(damBottom - gateMaxHeight)} scaleX={sx} scaleY={sy}>
            {/* Gate housing */}
            <Rect
              x={-5}
              y={-10}
              width={damWidth + 10}
              height={gateMaxHeight + 15}
              fill="#1e293b"
              stroke="#475569"
              strokeWidth={1}
            />
            {/* Gate (moves up when opening) */}
            <Rect
              x={2}
              y={gateMaxHeight - gateHeight}
              width={damWidth - 4}
              height={gateHeight}
              fill="#334155"
              stroke="#94a3b8"
              strokeWidth={2}
            />
            {/* Gate opening (water flows through) */}
            {dam.gate_position > 2 && (
              <Rect
                x={2}
                y={0}
                width={damWidth - 4}
                height={gateMaxHeight - gateHeight}
                fill={waterColor}
                opacity={0.5}
              />
            )}
          </Group>

          {/* ── Outflow channel (right side of dam) ── */}
          <Line
            points={[
              X(damX + damWidth), Y(damBottom + 20),
              X(damX + damWidth + 200), Y(damBottom + 20),
              X(damX + damWidth + 200), Y(damBottom - 20),
            ]}
            stroke="#475569"
            strokeWidth={S(2)}
          />

          {/* Outflow water */}
          {dam.gate_position > 2 && (
            <Rect
              x={X(damX + damWidth)}
              y={Y(damBottom)}
              width={X(200)}
              height={Y(20)}
              fill="#2563eb"
              opacity={0.5}
            />
          )}

          {/* Flow particles */}
          <WaterParticles
            x={X(damX + damWidth + 5)}
            y={Y(damBottom + 10)}
            width={X(190)}
            count={15}
            speed={dam.gate_position / 20}
            active={dam.gate_position > 2}
          />

          {/* Inflow particles (top-left) */}
          <WaterParticles
            x={X(50)}
            y={Y(waterTop + 5)}
            width={X(100)}
            count={10}
            speed={2}
            active={dam.inflow_rate > 10}
          />

          {/* Inflow arrow label */}
          <Text
            text={`INFLOW: ${dam.inflow_rate.toFixed(0)} m³/s →`}
            x={X(55)}
            y={Y(waterTop - 20)}
            fontSize={S(11)}
            fill="#60a5fa"
            fontFamily="monospace"
          />

          {/* Outflow label */}
          <Text
            text={`→ OUTFLOW: ${dam.outflow_rate.toFixed(0)} m³/s`}
            x={X(damX + damWidth + 10)}
            y={Y(damBottom - 35)}
            fontSize={S(11)}
            fill="#60a5fa"
            fontFamily="monospace"
          />

          {/* "To Treatment Plant →" label */}
          <Text
            text="→ To Treatment Plant"
            x={X(damX + damWidth + 100)}
            y={Y(damBottom + 5)}
            fontSize={S(10)}
            fill="#94a3b8"
            fontFamily="monospace"
          />

          {/* ── Water Level Gauge Bar ── */}
          <Group x={X(20)} y={Y(damTop)}>
            <Rect
              x={0}
              y={0}
              width={X(20)}
              height={Y(damHeight)}
              fill="#1e293b"
              stroke="#475569"
              strokeWidth={S(1)}
            />
            {/* Danger zone (top) */}
            <Rect
              x={0}
              y={0}
              width={X(20)}
              height={Y(damHeight * 0.15)}
              fill="#dc2626"
              opacity={0.3}
            />
            {/* Warning zone */}
            <Rect
              x={0}
              y={Y(damHeight * 0.15)}
              width={X(20)}
              height={Y(damHeight * 0.1)}
              fill="#f59e0b"
              opacity={0.3}
            />
            {/* Current level indicator */}
            <Rect
              x={0}
              y={Y(damHeight - waterHeight)}
              width={X(20)}
              height={Y(waterHeight)}
              fill={waterColor}
              opacity={0.8}
            />
            {/* Scale markers */}
            {[0, 20, 40, 60, 80, 100].map((val) => (
              <Text
                key={`scale-${val}`}
                text={`${val}`}
                x={X(24)}
                y={Y(damHeight - (val / 100) * damHeight) - S(5)}
                fontSize={S(9)}
                fill="#9ca3af"
                fontFamily="monospace"
              />
            ))}
          </Group>

          {/* ── Gauges ── */}
          <Gauge
            x={X(650)}
            y={Y(100)}
            radius={S(55)}
            value={dam.water_level}
            min={0}
            max={100}
            label="Water Level"
            unit="m"
            dangerHigh={85}
            dangerLow={20}
          />

          <Gauge
            x={X(800)}
            y={Y(100)}
            radius={S(55)}
            value={dam.gate_position}
            min={0}
            max={100}
            label="Gate Position"
            unit="%"
          />

          <Gauge
            x={X(650)}
            y={Y(260)}
            radius={S(55)}
            value={dam.inflow_rate}
            min={0}
            max={300}
            label="Inflow Rate"
            unit="m³/s"
          />

          <Gauge
            x={X(800)}
            y={Y(260)}
            radius={S(55)}
            value={dam.outflow_rate}
            min={0}
            max={300}
            label="Outflow Rate"
            unit="m³/s"
          />

          {/* ── Alarm indicators ── */}
          <StatusLight
            x={X(640)}
            y={Y(380)}
            size={S(10)}
            active={dam.high_level_alarm}
            label="HIGH LEVEL"
            color="#ef4444"
          />
          <StatusLight
            x={X(640)}
            y={Y(410)}
            size={S(10)}
            active={dam.low_level_alarm}
            label="LOW LEVEL"
            color="#f59e0b"
          />
          <StatusLight
            x={X(640)}
            y={Y(440)}
            size={S(10)}
            active={dam.spillway_active}
            label="SPILLWAY"
            color="#f97316"
          />
          <StatusLight
            x={X(640)}
            y={Y(470)}
            size={S(10)}
            active={dam.overflow}
            label="OVERFLOW"
            color="#dc2626"
          />

          {/* ── Spillway indicator ── */}
          {dam.spillway_active && (
            <Group>
              <Text
                text="⚠ SPILLWAY ACTIVE"
                x={X(150)}
                y={Y(damTop - 15)}
                fontSize={S(14)}
                fill="#f97316"
                fontFamily="monospace"
                fontStyle="bold"
              />
            </Group>
          )}

          {/* Ground/terrain */}
          <Line
            points={[0, Y(damBottom + 22), W, Y(damBottom + 22)]}
            stroke="#334155"
            strokeWidth={S(2)}
          />
          <Rect
            x={0}
            y={Y(damBottom + 22)}
            width={W}
            height={H - Y(damBottom + 22)}
            fill="#1e293b"
          />

          {/* Bottom info bar */}
          <Rect
            x={0}
            y={Y(DH - 40)}
            width={W}
            height={Y(40)}
            fill="#0f172a"
          />
          <Text
            text={`Gate Target: ${dam.gate_target.toFixed(0)}%  |  Level: ${dam.water_level.toFixed(1)}m  |  Net Flow: ${(dam.inflow_rate - dam.outflow_rate).toFixed(1)} m³/s`}
            x={X(20)}
            y={Y(DH - 28)}
            fontSize={S(12)}
            fill="#94a3b8"
            fontFamily="monospace"
          />
        </Layer>
      </Stage>
    </div>
  );
}