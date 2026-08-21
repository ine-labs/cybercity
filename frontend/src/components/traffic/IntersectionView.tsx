import { Stage, Layer, Rect, Line, Text, Group, Circle } from "react-konva";
import { useState, useEffect, useRef } from "react";
import type { TrafficState } from "../../types/process";

interface IntersectionViewProps {
  traffic: TrafficState;
}

const LIGHT_COLORS = {
  red: "#ef4444",
  yellow: "#eab308",
  green: "#22c55e",
};

const LIGHT_DIM = {
  red: "#3b1111",
  yellow: "#3b3511",
  green: "#113b19",
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

/** Single traffic light (3 circles stacked vertically) */
function TrafficLight({
  x,
  y,
  state,
  flash,
  label,
  s,
}: {
  x: number;
  y: number;
  state: "red" | "yellow" | "green";
  flash: boolean;
  label: string;
  s: number;
}) {
  const [flashOn, setFlashOn] = useState(true);

  useEffect(() => {
    if (!flash) {
      setFlashOn(true);
      return;
    }
    const interval = setInterval(() => setFlashOn((p) => !p), 500);
    return () => clearInterval(interval);
  }, [flash]);

  const activeState = flash ? (flashOn ? "red" : "red") : state;
  const showRed = flash ? flashOn : activeState === "red";

  return (
    <Group x={x} y={y} scaleX={s} scaleY={s}>
      {/* Housing */}
      <Rect
        x={-12}
        y={-5}
        width={24}
        height={62}
        fill="#1e293b"
        stroke="#475569"
        strokeWidth={1}
        cornerRadius={4}
      />
      {/* Red */}
      <Circle
        x={0}
        y={8}
        radius={8}
        fill={
          flash
            ? flashOn
              ? LIGHT_COLORS.red
              : LIGHT_DIM.red
            : activeState === "red"
            ? LIGHT_COLORS.red
            : LIGHT_DIM.red
        }
        shadowColor={showRed ? LIGHT_COLORS.red : undefined}
        shadowBlur={showRed ? 12 : 0}
      />
      {/* Yellow */}
      <Circle
        x={0}
        y={26}
        radius={8}
        fill={
          !flash && activeState === "yellow"
            ? LIGHT_COLORS.yellow
            : LIGHT_DIM.yellow
        }
        shadowColor={!flash && activeState === "yellow" ? LIGHT_COLORS.yellow : undefined}
        shadowBlur={!flash && activeState === "yellow" ? 12 : 0}
      />
      {/* Green */}
      <Circle
        x={0}
        y={44}
        radius={8}
        fill={
          !flash && activeState === "green"
            ? LIGHT_COLORS.green
            : LIGHT_DIM.green
        }
        shadowColor={!flash && activeState === "green" ? LIGHT_COLORS.green : undefined}
        shadowBlur={!flash && activeState === "green" ? 12 : 0}
      />
      {/* Label */}
      <Text
        text={label}
        x={-20}
        y={62}
        width={40}
        align="center"
        fontSize={10}
        fill="#94a3b8"
        fontFamily="monospace"
      />
    </Group>
  );
}

/** Car queue visualization (rectangles lined up) */
function CarQueue({
  x,
  y,
  count,
  direction,
  s,
}: {
  x: number;
  y: number;
  count: number;
  direction: "up" | "down" | "left" | "right";
  s: number;
}) {
  const maxShow = 12;
  const shown = Math.min(count, maxShow);
  const carW = direction === "up" || direction === "down" ? 10 : 16;
  const carH = direction === "up" || direction === "down" ? 16 : 10;
  const gap = 3;

  return (
    <Group x={x} y={y} scaleX={s} scaleY={s}>
      {Array.from({ length: shown }, (_, i) => {
        let cx = 0,
          cy = 0;
        if (direction === "up") {
          cy = (i + 1) * (carH + gap);
        } else if (direction === "down") {
          cy = -(i + 1) * (carH + gap);
        } else if (direction === "left") {
          cx = (i + 1) * (carW + gap);
        } else {
          cx = -(i + 1) * (carW + gap);
        }
        return (
          <Rect
            key={i}
            x={cx - carW / 2}
            y={cy - carH / 2}
            width={carW}
            height={carH}
            fill={i < 3 ? "#60a5fa" : i < 7 ? "#a78bfa" : "#f87171"}
            cornerRadius={2}
            opacity={0.8}
          />
        );
      })}
      {count > maxShow && (
        <Text
          text={`+${count - maxShow}`}
          x={
            direction === "left"
              ? (maxShow + 1) * (carW + gap)
              : direction === "right"
              ? -(maxShow + 1) * (carW + gap)
              : -15
          }
          y={
            direction === "up"
              ? (maxShow + 1) * (carH + gap)
              : direction === "down"
              ? -(maxShow + 1) * (carH + gap)
              : -5
          }
          fontSize={10}
          fill="#f87171"
          fontFamily="monospace"
        />
      )}
    </Group>
  );
}

const PHASE_NAMES: Record<number, string> = {
  1: "NS GREEN",
  2: "NS YELLOW",
  3: "ALL RED",
  4: "EW GREEN",
  5: "EW YELLOW",
  6: "ALL RED",
};

// Native design space — authored here, then mapped onto the live canvas.
// Positions fill the full area (X/Y); circles, gauges and text scale
// uniformly (S) so nothing ever looks stretched.
const DW = 900;
const DH = 550;

export function IntersectionView({ traffic }: IntersectionViewProps) {
  const [wrapRef, box] = useContainerBox<HTMLDivElement>();
  const W = box.w || DW;
  const H = box.h || DH;

  const sx = W / DW;
  const sy = H / DH;
  const k = Math.min(sx, sy);
  const X = (v: number) => v * sx; // horizontal position / length
  const Y = (v: number) => v * sy; // vertical position / length
  const S = (v: number) => v * k;  // uniform size (radius, font, stroke)

  const CX = 350; // intersection center X (design space)
  const CY = 260; // intersection center Y
  const ROAD_W = 80; // road width

  const isFlash = traffic.flash_mode;
  const isConflict = traffic.conflict_detected;
  const isPreemption = traffic.preemption_active > 0;

  // Status text
  let statusText = "NORMAL OPERATION";
  let statusColor = "#22c55e";
  if (isConflict) {
    statusText = "!! CONFLICT — OPPOSING GREENS !!";
    statusColor = "#ef4444";
  } else if (isFlash) {
    statusText = "FLASH MODE — CONFLICT MONITOR TRIGGERED";
    statusColor = "#f59e0b";
  } else if (isPreemption) {
    statusText = `PREEMPTION ACTIVE — ${traffic.preemption_active === 1 ? "N-S" : "E-W"} PRIORITY`;
    statusColor = "#f97316";
  } else if (traffic.gridlock_level > 60) {
    statusText = "WARNING — HIGH CONGESTION";
    statusColor = "#f59e0b";
  }

  return (
    <div ref={wrapRef} className="w-full">
      <Stage width={W} height={H}>
        <Layer>
          {/* Background */}
          <Rect
            width={W}
            height={H}
            fill={isConflict ? "#1a0505" : "#0f172a"}
          />

          {/* Title */}
          <Text
            text="INTERSECTION OVERVIEW"
            x={X(20)}
            y={Y(15)}
            fontSize={S(18)}
            fill="#e2e8f0"
            fontFamily="monospace"
            fontStyle="bold"
          />
          <Text
            text={statusText}
            x={X(20)}
            y={Y(38)}
            fontSize={S(13)}
            fill={statusColor}
            fontFamily="monospace"
          />

          {/* ── Roads ── */}
          {/* N-S road */}
          <Rect
            x={X(CX - ROAD_W / 2)}
            y={0}
            width={X(ROAD_W)}
            height={H}
            fill="#334155"
          />
          {/* E-W road */}
          <Rect
            x={0}
            y={Y(CY - ROAD_W / 2)}
            width={X(600)}
            height={Y(ROAD_W)}
            fill="#334155"
          />

          {/* Road edges */}
          <Line points={[X(CX - ROAD_W / 2), Y(0), X(CX - ROAD_W / 2), Y(CY - ROAD_W / 2)]} stroke="#64748b" strokeWidth={S(2)} />
          <Line points={[X(CX + ROAD_W / 2), Y(0), X(CX + ROAD_W / 2), Y(CY - ROAD_W / 2)]} stroke="#64748b" strokeWidth={S(2)} />
          <Line points={[X(CX - ROAD_W / 2), Y(CY + ROAD_W / 2), X(CX - ROAD_W / 2), H]} stroke="#64748b" strokeWidth={S(2)} />
          <Line points={[X(CX + ROAD_W / 2), Y(CY + ROAD_W / 2), X(CX + ROAD_W / 2), H]} stroke="#64748b" strokeWidth={S(2)} />
          <Line points={[X(0), Y(CY - ROAD_W / 2), X(CX - ROAD_W / 2), Y(CY - ROAD_W / 2)]} stroke="#64748b" strokeWidth={S(2)} />
          <Line points={[X(0), Y(CY + ROAD_W / 2), X(CX - ROAD_W / 2), Y(CY + ROAD_W / 2)]} stroke="#64748b" strokeWidth={S(2)} />
          <Line points={[X(CX + ROAD_W / 2), Y(CY - ROAD_W / 2), X(600), Y(CY - ROAD_W / 2)]} stroke="#64748b" strokeWidth={S(2)} />
          <Line points={[X(CX + ROAD_W / 2), Y(CY + ROAD_W / 2), X(600), Y(CY + ROAD_W / 2)]} stroke="#64748b" strokeWidth={S(2)} />

          {/* Center lane dividers (dashed) */}
          {/* N-S center line (above intersection) */}
          {Array.from({ length: 8 }, (_, i) => (
            <Line
              key={`ns-top-${i}`}
              points={[X(CX), Y(20 + i * 25), X(CX), Y(30 + i * 25)]}
              stroke="#fbbf24"
              strokeWidth={S(1.5)}
            />
          ))}
          {/* N-S center line (below intersection) */}
          {Array.from({ length: 8 }, (_, i) => (
            <Line
              key={`ns-bot-${i}`}
              points={[X(CX), Y(CY + ROAD_W / 2 + 10 + i * 25), X(CX), Y(CY + ROAD_W / 2 + 20 + i * 25)]}
              stroke="#fbbf24"
              strokeWidth={S(1.5)}
            />
          ))}
          {/* E-W center line (left) */}
          {Array.from({ length: 8 }, (_, i) => (
            <Line
              key={`ew-left-${i}`}
              points={[X(20 + i * 30), Y(CY), X(30 + i * 30), Y(CY)]}
              stroke="#fbbf24"
              strokeWidth={S(1.5)}
            />
          ))}
          {/* E-W center line (right) */}
          {Array.from({ length: 5 }, (_, i) => (
            <Line
              key={`ew-right-${i}`}
              points={[X(CX + ROAD_W / 2 + 10 + i * 30), Y(CY), X(CX + ROAD_W / 2 + 20 + i * 30), Y(CY)]}
              stroke="#fbbf24"
              strokeWidth={S(1.5)}
            />
          ))}

          {/* Crosswalks */}
          {/* North crosswalk */}
          {Array.from({ length: 6 }, (_, i) => (
            <Rect
              key={`cw-n-${i}`}
              x={X(CX - ROAD_W / 2 + 5 + i * 13)}
              y={Y(CY - ROAD_W / 2 - 8)}
              width={X(8)}
              height={Y(6)}
              fill={traffic.ns_pedestrian === "walk" ? "#e2e8f0" : "#475569"}
              opacity={0.7}
            />
          ))}
          {/* South crosswalk */}
          {Array.from({ length: 6 }, (_, i) => (
            <Rect
              key={`cw-s-${i}`}
              x={X(CX - ROAD_W / 2 + 5 + i * 13)}
              y={Y(CY + ROAD_W / 2 + 2)}
              width={X(8)}
              height={Y(6)}
              fill={traffic.ns_pedestrian === "walk" ? "#e2e8f0" : "#475569"}
              opacity={0.7}
            />
          ))}
          {/* West crosswalk */}
          {Array.from({ length: 6 }, (_, i) => (
            <Rect
              key={`cw-w-${i}`}
              x={X(CX - ROAD_W / 2 - 8)}
              y={Y(CY - ROAD_W / 2 + 5 + i * 13)}
              width={X(6)}
              height={Y(8)}
              fill={traffic.ew_pedestrian === "walk" ? "#e2e8f0" : "#475569"}
              opacity={0.7}
            />
          ))}
          {/* East crosswalk */}
          {Array.from({ length: 6 }, (_, i) => (
            <Rect
              key={`cw-e-${i}`}
              x={X(CX + ROAD_W / 2 + 2)}
              y={Y(CY - ROAD_W / 2 + 5 + i * 13)}
              width={X(6)}
              height={Y(8)}
              fill={traffic.ew_pedestrian === "walk" ? "#e2e8f0" : "#475569"}
              opacity={0.7}
            />
          ))}

          {/* ── Traffic Lights ── */}
          {/* North light (for southbound traffic = NS) */}
          <TrafficLight
            x={X(CX - ROAD_W / 2 - 25)}
            y={Y(CY - ROAD_W / 2 - 80)}
            state={traffic.ns_light}
            flash={isFlash}
            label="N"
            s={k}
          />
          {/* South light (for northbound traffic = NS) */}
          <TrafficLight
            x={X(CX + ROAD_W / 2 + 25)}
            y={Y(CY + ROAD_W / 2 + 15)}
            state={traffic.ns_light}
            flash={isFlash}
            label="S"
            s={k}
          />
          {/* West light (for eastbound traffic = EW) */}
          <TrafficLight
            x={X(CX - ROAD_W / 2 - 80)}
            y={Y(CY + ROAD_W / 2 + 25)}
            state={traffic.ew_light}
            flash={isFlash}
            label="W"
            s={k}
          />
          {/* East light (for westbound traffic = EW) */}
          <TrafficLight
            x={X(CX + ROAD_W / 2 + 80)}
            y={Y(CY - ROAD_W / 2 - 25)}
            state={traffic.ew_light}
            flash={isFlash}
            label="E"
            s={k}
          />

          {/* ── Car Queues ── */}
          {/* Northbound (from south, going up) */}
          <CarQueue
            x={X(CX + ROAD_W / 4)}
            y={Y(CY + ROAD_W / 2 + 10)}
            count={traffic.ns_queue}
            direction="up"
            s={k}
          />
          {/* Southbound (from north, going down) */}
          <CarQueue
            x={X(CX - ROAD_W / 4)}
            y={Y(CY - ROAD_W / 2 - 10)}
            count={traffic.ns_queue}
            direction="down"
            s={k}
          />
          {/* Eastbound (from west, going right) */}
          <CarQueue
            x={X(CX - ROAD_W / 2 - 10)}
            y={Y(CY + ROAD_W / 4)}
            count={traffic.ew_queue}
            direction="right"
            s={k}
          />
          {/* Westbound (from east, going left) */}
          <CarQueue
            x={X(CX + ROAD_W / 2 + 10)}
            y={Y(CY - ROAD_W / 4)}
            count={traffic.ew_queue}
            direction="left"
            s={k}
          />

          {/* ── Direction Labels ── */}
          <Text text="N" x={X(CX - 5)} y={Y(65)} fontSize={S(16)} fill="#94a3b8" fontFamily="monospace" fontStyle="bold" />
          <Text text="S" x={X(CX - 5)} y={Y(DH - 80)} fontSize={S(16)} fill="#94a3b8" fontFamily="monospace" fontStyle="bold" />
          <Text text="W" x={X(30)} y={Y(CY - 8)} fontSize={S(16)} fill="#94a3b8" fontFamily="monospace" fontStyle="bold" />
          <Text text="E" x={X(570)} y={Y(CY - 8)} fontSize={S(16)} fill="#94a3b8" fontFamily="monospace" fontStyle="bold" />

          {/* ── Right Panel: Info ── */}
          {/* Phase info */}
          <Group x={X(640)} y={Y(80)} scaleX={k} scaleY={k}>
            <Text text="PHASE" x={0} y={0} fontSize={12} fill="#94a3b8" fontFamily="monospace" />
            <Text
              text={PHASE_NAMES[traffic.current_phase] || `PHASE ${traffic.current_phase}`}
              x={0}
              y={18}
              fontSize={16}
              fill={
                traffic.ns_light === "green"
                  ? "#22c55e"
                  : traffic.ew_light === "green"
                  ? "#22c55e"
                  : traffic.ns_light === "yellow" || traffic.ew_light === "yellow"
                  ? "#eab308"
                  : "#ef4444"
              }
              fontFamily="monospace"
              fontStyle="bold"
            />
            <Text
              text={`${traffic.phase_timer.toFixed(0)}s remaining`}
              x={0}
              y={40}
              fontSize={12}
              fill="#64748b"
              fontFamily="monospace"
            />
          </Group>

          {/* Queue stats */}
          <Group x={X(640)} y={Y(160)} scaleX={k} scaleY={k}>
            <Text text="QUEUES" x={0} y={0} fontSize={12} fill="#94a3b8" fontFamily="monospace" />
            <Text text={`N-S: ${traffic.ns_queue} cars`} x={0} y={20} fontSize={13} fill="#60a5fa" fontFamily="monospace" />
            <Text text={`E-W: ${traffic.ew_queue} cars`} x={0} y={38} fontSize={13} fill="#a78bfa" fontFamily="monospace" />
          </Group>

          {/* Wait times */}
          <Group x={X(640)} y={Y(230)} scaleX={k} scaleY={k}>
            <Text text="AVG WAIT" x={0} y={0} fontSize={12} fill="#94a3b8" fontFamily="monospace" />
            <Text text={`N-S: ${traffic.ns_wait_time.toFixed(0)}s`} x={0} y={20} fontSize={13} fill="#60a5fa" fontFamily="monospace" />
            <Text text={`E-W: ${traffic.ew_wait_time.toFixed(0)}s`} x={0} y={38} fontSize={13} fill="#a78bfa" fontFamily="monospace" />
          </Group>

          {/* Gridlock meter */}
          <Group x={X(640)} y={Y(310)} scaleX={k} scaleY={k}>
            <Text text="GRIDLOCK" x={0} y={0} fontSize={12} fill="#94a3b8" fontFamily="monospace" />
            <Rect x={0} y={18} width={200} height={14} fill="#1e293b" stroke="#475569" strokeWidth={1} cornerRadius={3} />
            <Rect
              x={1}
              y={19}
              width={Math.max(0, (traffic.gridlock_level / 100) * 198)}
              height={12}
              fill={
                traffic.gridlock_level > 70
                  ? "#ef4444"
                  : traffic.gridlock_level > 40
                  ? "#f59e0b"
                  : "#22c55e"
              }
              cornerRadius={2}
            />
            <Text
              text={`${traffic.gridlock_level.toFixed(0)}%`}
              x={210}
              y={18}
              fontSize={12}
              fill={traffic.gridlock_level > 70 ? "#ef4444" : "#94a3b8"}
              fontFamily="monospace"
            />
          </Group>

          {/* Status indicators */}
          <Group x={X(640)} y={Y(370)} scaleX={k} scaleY={k}>
            <Text text="STATUS" x={0} y={0} fontSize={12} fill="#94a3b8" fontFamily="monospace" />

            {/* Conflict monitor */}
            <Circle x={8} y={22} radius={5} fill={traffic.conflict_monitor_enabled ? "#22c55e" : "#ef4444"} />
            <Text
              text={traffic.conflict_monitor_enabled ? "Conflict Monitor: ON" : "Conflict Monitor: OFF"}
              x={18}
              y={16}
              fontSize={11}
              fill={traffic.conflict_monitor_enabled ? "#86efac" : "#fca5a5"}
              fontFamily="monospace"
            />

            {/* Preemption */}
            <Circle x={8} y={42} radius={5} fill={isPreemption ? "#f97316" : "#475569"} />
            <Text
              text={isPreemption ? `Preemption: ${traffic.preemption_active === 1 ? "N-S" : "E-W"}` : "Preemption: OFF"}
              x={18}
              y={36}
              fontSize={11}
              fill={isPreemption ? "#fdba74" : "#64748b"}
              fontFamily="monospace"
            />

            {/* Flash mode */}
            <Circle x={8} y={62} radius={5} fill={isFlash ? "#eab308" : "#475569"} />
            <Text
              text={isFlash ? "Flash Mode: ACTIVE" : "Flash Mode: OFF"}
              x={18}
              y={56}
              fontSize={11}
              fill={isFlash ? "#fde047" : "#64748b"}
              fontFamily="monospace"
            />

            {/* Conflict */}
            <Circle x={8} y={82} radius={5} fill={isConflict ? "#ef4444" : "#475569"} />
            <Text
              text={isConflict ? "CONFLICT DETECTED!" : "No Conflict"}
              x={18}
              y={76}
              fontSize={11}
              fill={isConflict ? "#fca5a5" : "#64748b"}
              fontFamily="monospace"
            />
          </Group>

          {/* Conflict overlay */}
          {isConflict && (
            <Group>
              <Rect
                x={X(CX - 80)}
                y={Y(CY - 20)}
                width={X(160)}
                height={Y(40)}
                fill="#ef4444"
                opacity={0.3}
                cornerRadius={S(4)}
              />
              <Text
                text="COLLISION RISK"
                x={X(CX - 60)}
                y={Y(CY - 8)}
                fontSize={S(16)}
                fill="#ef4444"
                fontFamily="monospace"
                fontStyle="bold"
              />
            </Group>
          )}

          {/* Bottom info bar */}
          <Rect x={0} y={Y(DH - 40)} width={W} height={Y(40)} fill="#0f172a" />
          <Text
            text={`Cycles: ${traffic.cycle_count}  |  Vehicles Passed: ${traffic.total_vehicles_passed}  |  Phase Hold: ${traffic.phase_hold > 0 ? `Phase ${traffic.phase_hold}` : "OFF"}  |  Timing: NS=${traffic.ns_green_time.toFixed(0)}s  EW=${traffic.ew_green_time.toFixed(0)}s`}
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