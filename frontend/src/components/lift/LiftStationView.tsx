/**
 * LiftStationView — animated process view for Cedar Creek Lift Station 7.
 * Consumes DISPLAYED state (the operator's world). When the comms gateway is
 * flooded, field polls stop and this view freezes on the last good reading with
 * a COMMS LOST banner — the operator has no idea the wet well is overflowing.
 */

import { useEffect, useRef, useState } from "react";
import { Stage, Layer, Rect, Circle, Line, Text, Group } from "react-konva";
import type { LiftStationState } from "../../types/process";

interface Props { lift: LiftStationState }

const C = {
  bg: "#07100f",
  sewage: "#0d9488",
  sewageTop: "#2dd4bf",
  pipe: "#475569",
  ok: "#22c55e",
  warn: "#f59e0b",
  danger: "#ef4444",
  textDim: "#6b7280",
  textMid: "#9ca3af",
  textBright: "#e5e7eb",
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
        h: Math.max(280, window.innerHeight - rect.top - 8),
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
const DW = 720;
const DH = 360;
const WELL_X = 70, WELL_Y = 80, WELL_W = 200, WELL_H = 210;

function Gauge({ x, y, s, label, value, unit, color }: {
  x: number; y: number; s: number; label: string; value: string; unit: string; color: string;
}) {
  return (
    <Group x={x} y={y}>
      <Rect width={150 * s} height={52 * s} cornerRadius={6 * s} fill="#0f1a19" stroke="#1f3330" strokeWidth={s} />
      <Text x={10 * s} y={8 * s} text={label} fontSize={10 * s} fontFamily="monospace" fill={C.textDim} />
      <Text x={10 * s} y={22 * s} text={value} fontSize={20 * s} fontFamily="monospace" fontStyle="bold" fill={color} />
      <Text x={112 * s} y={32 * s} text={unit} fontSize={10 * s} fontFamily="monospace" fill={C.textDim} />
    </Group>
  );
}

export function LiftStationView({ lift }: Props) {
  const [wrapRef, box] = useContainerBox<HTMLDivElement>();
  const W = box.w || DW;
  const H = box.h || DH;

  const sx = W / DW;
  const sy = H / DH;
  const k = Math.min(sx, sy);
  const X = (v: number) => v * sx; // horizontal position / length
  const Y = (v: number) => v * sy; // vertical position / length
  const S = (v: number) => v * k;  // uniform size (radius, font, stroke)

  const [phase, setPhase] = useState(0);
  const raf = useRef<number | undefined>(undefined);

  useEffect(() => {
    const step = () => { setPhase(p => (p + 0.05) % (Math.PI * 2)); raf.current = requestAnimationFrame(step); };
    raf.current = requestAnimationFrame(step);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, []);

  const level = Math.max(0, Math.min(100, lift.wet_well_level));
  const fillH = (WELL_H - 6) * level / 100;
  const fillY = WELL_Y + WELL_H - 3 - fillH;
  const pumping = lift.pump_running;

  const status = lift.comms_lost ? "COMMS LOST — DATA STALE"
    : lift.overflow ? "OVERFLOW — SEWAGE SPILL"
    : lift.high_level_alarm ? "HIGH LEVEL"
    : "NORMAL OPERATION";
  const statusColor = lift.comms_lost ? C.warn : lift.overflow ? C.danger : lift.high_level_alarm ? C.warn : C.ok;

  const inflowN = Math.max(2, Math.round(lift.inflow_rate / 12));

  return (
    <div ref={wrapRef} className="w-full" style={{ background: C.bg, borderRadius: 8 }}>
      <Stage width={W} height={H}>
        <Layer>
          <Rect x={0} y={0} width={W} height={H} fill={C.bg} />
          <Text x={X(24)} y={Y(16)} text="CEDAR CREEK LIFT STATION 7" fontSize={S(15)} fontFamily="monospace" fontStyle="bold" fill={C.textBright} />
          <Text x={X(24)} y={Y(38)} text={status} fontSize={S(12)} fontFamily="monospace" fontStyle="bold" fill={statusColor} />

          {/* Inflow gravity sewer */}
          <Rect x={0} y={Y(WELL_Y + 24)} width={X(WELL_X)} height={Y(12)} fill={C.pipe} />
          {Array.from({ length: inflowN }).map((_, i) => {
            const t = (phase / (Math.PI * 2) + i / inflowN) % 1;
            return <Circle key={i} x={X(4 + t * (WELL_X - 8))} y={Y(WELL_Y + 30)} radius={S(2.2)} fill={C.sewageTop} opacity={0.8} />;
          })}
          <Text x={X(4)} y={Y(WELL_Y + 6)} text="INFLOW" fontSize={S(9)} fontFamily="monospace" fill={C.textDim} />

          {/* Wet well */}
          <Rect x={X(WELL_X)} y={Y(WELL_Y)} width={X(WELL_W)} height={Y(WELL_H)} cornerRadius={S(3)}
            fill="#0a1413" stroke={lift.overflow ? C.danger : "#1f3330"} strokeWidth={lift.overflow ? S(2) : S(1)} />
          <Rect x={X(WELL_X + 3)} y={Y(fillY)} width={X(WELL_W - 6)} height={Y(fillH)} cornerRadius={S(2)} fill={C.sewage} opacity={0.85} />
          <Rect x={X(WELL_X + 3)} y={Y(fillY)} width={X(WELL_W - 6)} height={Y(4)} fill={C.sewageTop} opacity={0.9} />

          {/* Setpoint / alarm markers */}
          {[{ p: 90, c: C.danger, t: "ALARM 90%" }, { p: 75, c: C.warn, t: "START 75%" }, { p: 25, c: C.textDim, t: "STOP 25%" }].map(m => {
            const my = WELL_Y + WELL_H - 3 - (WELL_H - 6) * m.p / 100;
            return (
              <Group key={m.p}>
                <Line points={[X(WELL_X), Y(my), X(WELL_X + WELL_W), Y(my)]} stroke={m.c} strokeWidth={S(0.7)} dash={[S(4), S(3)]} opacity={0.6} />
                <Text x={X(WELL_X + WELL_W + 4)} y={Y(my) - S(5)} text={m.t} fontSize={S(9)} fontFamily="monospace" fill={m.c} />
              </Group>
            );
          })}
          <Text x={X(WELL_X + WELL_W / 2) - S(22)} y={Y(WELL_Y + WELL_H / 2)} text={`${level.toFixed(0)}%`} fontSize={S(26)} fontFamily="monospace" fontStyle="bold" fill="#e6fffb" />

          {/* Overflow spill */}
          {lift.overflow && Array.from({ length: 6 }).map((_, i) => {
            const t = (phase / (Math.PI * 2) + i / 6) % 1;
            return <Circle key={i} x={X(WELL_X - 6 - t * 30)} y={Y(WELL_Y + 4 + t * t * 40)} radius={S(3)} fill={C.danger} opacity={0.7 - t * 0.5} />;
          })}

          {/* Pump + force main */}
          <Circle x={X(WELL_X + WELL_W / 2)} y={Y(WELL_Y + WELL_H - 16)} radius={S(12)} fill="#0f2a27"
            stroke={pumping ? C.ok : C.textDim} strokeWidth={S(1.5)} />
          <Line points={[X(WELL_X + WELL_W / 2), Y(WELL_Y + WELL_H - 16),
            X(WELL_X + WELL_W / 2) + Math.cos(pumping ? phase * 4 : 0.6) * S(7),
            Y(WELL_Y + WELL_H - 16) + Math.sin(pumping ? phase * 4 : 0.6) * S(7)]}
            stroke={pumping ? C.ok : C.textDim} strokeWidth={S(2)} />
          <Text x={X(WELL_X + WELL_W / 2) - S(14)} y={Y(WELL_Y + WELL_H + 2)} text="PUMP" fontSize={S(9)} fontFamily="monospace" fill={pumping ? C.ok : C.textDim} />
          {/* force main rising to discharge */}
          <Rect x={X(WELL_X + WELL_W - 40)} y={Y(WELL_Y - 20)} width={X(10)} height={Y(WELL_H - 6)} fill={C.pipe} />
          <Rect x={X(WELL_X + WELL_W / 2)} y={Y(WELL_Y - 20)} width={X(WELL_W / 2 - 30)} height={Y(10)} fill={C.pipe} />
          {pumping && Array.from({ length: 4 }).map((_, i) => {
            const t = (phase / (Math.PI * 2) + i / 4) % 1;
            return <Circle key={i} x={X(WELL_X + WELL_W - 35)} y={Y((WELL_Y + WELL_H - 20) - t * (WELL_H - 20))} radius={S(2.2)} fill={C.sewageTop} opacity={0.8} />;
          })}
          <Text x={X(WELL_X + WELL_W - 62)} y={Y(WELL_Y - 34)} text="FORCE MAIN →" fontSize={S(9)} fontFamily="monospace" fill={C.textDim} />

          {/* Gauges */}
          <Gauge x={X(490)} y={Y(70)}  s={k} label="WET WELL LEVEL" value={level.toFixed(0)} unit="%" color={lift.overflow ? C.danger : lift.high_level_alarm ? C.warn : C.sewageTop} />
          <Gauge x={X(490)} y={Y(132)} s={k} label="INFLOW" value={lift.inflow_rate.toFixed(0)} unit="L/s" color={C.textBright} />
          <Gauge x={X(490)} y={Y(194)} s={k} label="PUMP OUTFLOW" value={lift.outflow_rate.toFixed(0)} unit="L/s" color={pumping ? C.ok : C.textDim} />
          <Gauge x={X(490)} y={Y(256)} s={k} label="FORCE MAIN" value={lift.force_main_pressure.toFixed(0)} unit="psi" color={C.textBright} />

          {/* Comms-lost overlay banner */}
          {lift.comms_lost && (
            <Group>
              <Rect x={X(WELL_X)} y={Y(WELL_Y + WELL_H / 2 - 18)} width={X(WELL_W)} height={Y(36)} fill="#78350f" opacity={0.85} cornerRadius={S(4)} />
              <Text x={X(WELL_X + 12)} y={Y(WELL_Y + WELL_H / 2 - 18) + S(8)} text="⚠ COMMS LOST" fontSize={S(13)} fontFamily="monospace" fontStyle="bold" fill="#fde68a" />
              <Text x={X(WELL_X + 12)} y={Y(WELL_Y + WELL_H / 2 - 18) + S(22)} text="displayed data is STALE" fontSize={S(9)} fontFamily="monospace" fill="#fcd34d" />
            </Group>
          )}

          <Text x={X(24)} y={Y(DH - 16)}
            text={`Gateway: ${lift.gateway_pkt_rate}/${lift.gateway_capacity} pkt/s   |   Field comms: ${lift.field_comms_ok ? "OK" : "LOST"}   |   Spill: ${lift.spill_volume_l.toFixed(0)} L`}
            fontSize={S(11)} fontFamily="monospace" fill={lift.field_comms_ok ? C.textDim : C.danger} />
        </Layer>
      </Stage>
    </div>
  );
}