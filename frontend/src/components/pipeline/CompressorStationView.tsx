/**
 * CompressorStationView — Animated Process Diagram
 * Meridian Compressor Station 7 — Natural Gas Pipeline
 */

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Stage, Layer, Rect, Circle, Line, Text, Group, RegularPolygon } from "react-konva";
import type { KonvaEventObject } from "konva/lib/Node";
import type { PipelineState } from "../../types/process";

interface Props { pipeline: PipelineState }

// ── Hover tooltip info ──────────────────────────────────────────────────────
interface HoverInfo { title: string; desc: string; tag?: string; tagColor?: string }
type HoverHandler = (info: HoverInfo, x: number, y: number) => void;

function Hoverable({ info, onHover, onLeave, children }: {
  info: HoverInfo; onHover: HoverHandler; onLeave: () => void; children: ReactNode;
}) {
  const move = (e: KonvaEventObject<MouseEvent>) => onHover(info, e.evt.clientX, e.evt.clientY);
  return (
    <Group
      onMouseEnter={(e) => {
        const stage = e.target.getStage();
        if (stage) stage.container().style.cursor = "pointer";
        move(e);
      }}
      onMouseMove={move}
      onMouseLeave={(e) => {
        const stage = e.target.getStage();
        if (stage) stage.container().style.cursor = "default";
        onLeave();
      }}
    >
      {children}
    </Group>
  );
}

// ── Palette ───────────────────────────────────────────────────────────────
const C = {
  gas:        "#fb923c",
  gasDim:     "#7c4a1e",
  energized:  "#22c55e",
  closed:     "#ef4444",
  warn:       "#f59e0b",
  bg:         "#030712",
  textDim:    "#6b7280",
  textMid:    "#9ca3af",
  textBright: "#e5e7eb",
  flame:      "#f97316",
  smoke:      "rgba(148,163,184,0.35)",
};

const BASE_W = 720, BASE_H = 360, PANEL_W = 220;
const PIPE_Y      = 260;
const SUCTION_X   = 60;
const SVALVE_X    = 150;
const COMP_X      = 260;
const COMP_R      = 42;
const DVALVE_X    = 580;
const DOWNSTREAM_X= 660;
const PRV_STUB_X  = 400;
const BLOWDOWN_STUB_X = 480;
const STACK_TOP_Y = 60;
const W = BASE_W, H = BASE_H;

// ── Responsive container width ────────────────────────────────────────────
function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setWidth(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

// ── Flow particles (with comet trail) ─────────────────────────────────────
interface Particle { id: number; t: number; speed: number }

function useParticles(on: boolean, n = 5) {
  const [ps, setPs] = useState<Particle[]>(() =>
    Array.from({ length: n }, (_, i) => ({ id: i, t: i / n, speed: 0.004 + i * 0.0004 }))
  );
  const raf = useRef<number>();
  useEffect(() => {
    if (!on) return;
    const step = () => {
      setPs(prev => prev.map(p => ({ ...p, t: (p.t + p.speed) % 1 })));
      raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [on]);
  return ps;
}

function FlowStream({ x1, x2, y, particles, col }: {
  x1: number; x2: number; y: number; particles: Particle[]; col: string;
}) {
  return (
    <>
      {particles.map(pt => {
        const x = x1 + (x2 - x1) * pt.t;
        return (
          <Group key={pt.id} listening={false}>
            <Circle x={x - (x2 > x1 ? 9 : -9)} y={y} radius={1.6} fill={col} opacity={0.18} />
            <Circle x={x - (x2 > x1 ? 5 : -5)} y={y} radius={2} fill={col} opacity={0.35} />
            <Circle x={x} y={y} radius={2.6} fill={col} opacity={0.85} />
          </Group>
        );
      })}
    </>
  );
}

// ── Static flow-direction chevrons ────────────────────────────────────────
function FlowArrows({ x1, x2, y, active, col }: {
  x1: number; x2: number; y: number; active: boolean; col: string;
}) {
  const n = Math.max(1, Math.round(Math.abs(x2 - x1) / 55));
  const dir = x2 > x1 ? 1 : -1;
  return (
    <>
      {Array.from({ length: n }, (_, i) => {
        const cx = x1 + ((x2 - x1) * (i + 1)) / (n + 1);
        return (
          <RegularPolygon
            key={i} x={cx} y={y} sides={3} radius={5}
            rotation={dir > 0 ? 90 : -90}
            fill={active ? col : "#374151"}
            opacity={active ? 0.9 : 0.5}
            listening={false}
          />
        );
      })}
    </>
  );
}

// ── Valve symbol (bowtie, P&ID-style, with actuator stem) ─────────────────
// kind="flow": open=safe/green, closed=abnormal/red (suction, discharge, PRV isolation)
// kind="vent": closed=safe/idle (gray), open=actively venting (amber) — a vent valve
//              being open isn't itself a fault, so it shouldn't read as "red alarm"
function Valve({ x, y, open, id, vertical = false, kind = "flow" }: {
  x: number; y: number; open: boolean; id: string; vertical?: boolean; kind?: "flow" | "vent";
}) {
  const col = kind === "vent"
    ? (open ? C.warn : "#6b7280")
    : (open ? C.energized : C.closed);
  const S = 10;
  return (
    <Group>
      {/* Pipe flange rings */}
      <Circle x={vertical ? x : x - S - 5} y={vertical ? y - S - 5 : y} radius={2.5} fill="none" stroke="#4b5563" strokeWidth={1} />
      <Circle x={vertical ? x : x + S + 5} y={vertical ? y + S + 5 : y} radius={2.5} fill="none" stroke="#4b5563" strokeWidth={1} />
      {/* Actuator stem (remote-operated valve) */}
      <Line points={vertical ? [x, y - S, x + 14, y - S] : [x, y - S, x, y - S - 12]}
        stroke="#6b7280" strokeWidth={2} />
      <Rect x={vertical ? x + 12 : x - 5} y={vertical ? y - S - 5 : y - S - 20}
        width={10} height={8} fill="#1f2937" stroke="#6b7280" strokeWidth={1} cornerRadius={1.5} />
      {/* Body */}
      <Rect x={x - S} y={y - S} width={2 * S} height={2 * S}
        fill={kind === "vent"
          ? (open ? "rgba(245,158,11,0.12)" : "rgba(107,114,128,0.08)")
          : (open ? "rgba(34,197,94,0.10)" : "rgba(239,68,68,0.12)")}
        stroke={col} strokeWidth={1.5} cornerRadius={2} />
      <Line points={[x - S, y - S, x + S, y + S]} stroke={col} strokeWidth={1.3} />
      <Line points={[x + S, y - S, x - S, y + S]} stroke={col} strokeWidth={1.3} />
      <Text x={vertical ? x + S + 4 : x - S - 2} y={vertical ? y - 5 : y + S + 3}
        text={id} fontSize={8} fontFamily="monospace" fill={col} />
    </Group>
  );
}

// ── Animation helper hooks ─────────────────────────────────────────────────
function useRotation(rpm: number) {
  const [angle, setAngle] = useState(0);
  const raf = useRef<number>();
  useEffect(() => {
    const step = () => {
      setAngle(a => (a + Math.max(0, rpm) * 0.0009) % 360);
      raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [rpm]);
  return angle;
}

function useJitter(intensity: number) {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const raf = useRef<number>();
  useEffect(() => {
    if (intensity <= 0) { setOffset({ x: 0, y: 0 }); return; }
    const step = () => {
      setOffset({
        x: (Math.random() - 0.5) * intensity,
        y: (Math.random() - 0.5) * intensity,
      });
      raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [intensity]);
  return offset;
}

// ── Compressor rotor (turbine blades, motion blur, vibration shake) ───────
function Compressor({ x, y, r, rpm, vibration, tripped, ruptured }: {
  x: number; y: number; r: number; rpm: number; vibration: number; tripped: boolean; ruptured: boolean;
}) {
  const angle = useRotation(tripped || ruptured ? 0 : rpm);
  const jitter = useJitter(vibration > 7 ? Math.min(5, (vibration - 7) * 0.7) : 0);
  const overspeed = rpm > 11000;
  const col = ruptured ? C.closed : overspeed ? C.warn : tripped ? "#4b5563" : C.energized;
  const speedFrac = Math.min(1, rpm / 9500);
  const pulse = Math.sin((angle / 360) * Math.PI * 2 * 3) * 0.5 + 0.5;
  const blades = [0, 60, 120, 180, 240, 300];

  return (
    <Group x={x + jitter.x} y={y + jitter.y}>
      {/* Breathing glow, synced to rotation */}
      <Circle radius={r + 14 + pulse * 3}
        fill={overspeed ? `rgba(245,158,11,${0.08 + pulse * 0.05})` : `rgba(34,197,94,${0.05 + pulse * 0.03})`} />
      {/* Housing shadow */}
      <Circle y={3} radius={r} fill="rgba(0,0,0,0.35)" />
      <Circle radius={r} stroke={col} strokeWidth={2.5} fill="rgba(3,7,18,0.85)" />

      {/* Motion-blur ghost blades (trailing) */}
      {speedFrac > 0.15 && (
        <>
          <Group rotation={angle - 10 * speedFrac} opacity={0.10 * speedFrac}>
            {blades.map(a => (
              <Line key={a} points={[0, 0, r - 6, 0]} stroke={col} strokeWidth={4} rotation={a} lineCap="round" />
            ))}
          </Group>
          <Group rotation={angle - 18 * speedFrac} opacity={0.05 * speedFrac}>
            {blades.map(a => (
              <Line key={a} points={[0, 0, r - 6, 0]} stroke={col} strokeWidth={4} rotation={a} lineCap="round" />
            ))}
          </Group>
        </>
      )}

      {/* Blades */}
      <Group rotation={angle}>
        {blades.map(a => (
          <Line key={a} points={[0, 0, r - 6, 0]} stroke={col} strokeWidth={3.2} rotation={a} lineCap="round" />
        ))}
      </Group>
      <Circle radius={5} fill={col} />
      <Circle radius={2} fill="#030712" />

      <Text x={-r} y={r + 8} width={2 * r} align="center" text="COMPRESSOR"
        fontSize={9} fontFamily="monospace" fontStyle="bold" fill={col} />
      <Text x={-r} y={r + 20} width={2 * r} align="center" text={`${rpm.toFixed(0)} RPM`}
        fontSize={9} fontFamily="monospace" fill={overspeed ? C.warn : C.textMid} />
    </Group>
  );
}

// ── Vent stack: layered flicker flame + rising smoke ──────────────────────
function VentStack({ x, topY, bottomY, active, label }: {
  x: number; topY: number; bottomY: number; active: boolean; label: string;
}) {
  const [tick, setTick] = useState(0);
  const raf = useRef<number>();
  useEffect(() => {
    if (!active) return;
    const step = () => { setTick(t => t + 1); raf.current = requestAnimationFrame(step); };
    raf.current = requestAnimationFrame(step);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [active]);

  const [smoke, setSmoke] = useState<{ id: number; y: number; x: number; life: number }[]>([]);
  useEffect(() => {
    if (!active) { setSmoke([]); return; }
    const iv = setInterval(() => {
      setSmoke(prev => {
        const next = prev
          .map(s => ({ ...s, y: s.y - 1.2, life: s.life - 0.02 }))
          .filter(s => s.life > 0);
        if (Math.random() < 0.5) {
          next.push({ id: Math.random(), y: topY - 6, x: (Math.random() - 0.5) * 10, life: 1 });
        }
        return next;
      });
    }, 40);
    return () => clearInterval(iv);
  }, [active, topY]);

  const flicker1 = active ? 3 + Math.sin(tick * 0.9) * 2 + Math.random() * 2 : 0;
  const flicker2 = active ? 2 + Math.cos(tick * 1.3) * 1.5 + Math.random() * 1.5 : 0;
  const col = active ? C.flame : "#374151";

  return (
    <Group>
      <Line points={[x, bottomY, x, topY]} stroke={active ? C.gas : "#4b5563"} strokeWidth={3} />
      {active && (
        <>
          {smoke.map(s => (
            <Circle key={s.id} x={x + s.x} y={s.y} radius={3 + (1 - s.life) * 4} fill={C.smoke} opacity={s.life * 0.4} />
          ))}
          <Circle x={x} y={topY - 2} radius={7 + flicker1} fill="rgba(239,68,68,0.25)" />
          <Circle x={x} y={topY - 4} radius={5 + flicker1} fill="rgba(249,115,22,0.55)" />
          <Circle x={x} y={topY - 8} radius={3 + flicker2} fill="rgba(251,191,36,0.8)" />
          <Circle x={x} y={topY - 10} radius={1.4 + flicker2 * 0.4} fill="rgba(255,247,214,0.9)" />
        </>
      )}
      <Text x={x - 30} y={topY - 22} width={60} align="center" text={label}
        fontSize={7.5} fontFamily="monospace" fill={col} />
    </Group>
  );
}

// ── Rupture shockwave ──────────────────────────────────────────────────────
function Shockwave({ x, y, active }: { x: number; y: number; active: boolean }) {
  const [r, setR] = useState(0);
  useEffect(() => {
    if (!active) { setR(0); return; }
    const iv = setInterval(() => setR(v => (v > 340 ? 0 : v + 6)), 20);
    return () => clearInterval(iv);
  }, [active]);
  if (!active) return null;
  return (
    <Circle x={x} y={y} radius={r} stroke="rgba(251,146,60,0.5)" strokeWidth={Math.max(0, 3 - r / 120)} listening={false} />
  );
}

// ── Right-panel row ────────────────────────────────────────────────────────
function Row({ label, value, unit, col }: { label: string; value: string; unit: string; col: string }) {
  return (
    <div className="flex justify-between items-center py-[3px] border-b border-gray-800">
      <span className="text-gray-500 text-[10px] font-mono">{label}</span>
      <span className="font-mono text-[10px] font-bold" style={{ color: col }}>
        {value}<span className="text-gray-600 font-normal ml-0.5">{unit}</span>
      </span>
    </div>
  );
}

const MIN_SCALE = 0.55;
const MAX_SCALE = 2.0;
const MAX_CONTENT_W = BASE_W * MAX_SCALE + PANEL_W;   // container caps out exactly when scale hits MAX_SCALE — no leftover gap

export function CompressorStationView({ pipeline: p }: Props) {
  const [hover, setHover] = useState<{ info: HoverInfo; x: number; y: number } | null>(null);
  const handleHover: HoverHandler = (info, x, y) => setHover({ info, x, y });
  const handleLeave = () => setHover(null);

  const [wrapRef, wrapWidth] = useElementWidth<HTMLDivElement>();
  const canvasAvail = Math.max(360, (wrapWidth || BASE_W + PANEL_W) - PANEL_W);
  const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, canvasAvail / BASE_W));
  const stageW = Math.round(BASE_W * scale);
  const stageH = Math.round(BASE_H * scale);

  const suctionFlow = useParticles(p.suction_valve_open && p.compressor_rpm > 100, 4);
  const dischargeFlow = useParticles(p.discharge_valve_open && p.compressor_rpm > 100 && !p.ruptured, 5);
  const downstreamFlow = useParticles(p.discharge_valve_open && p.flow_rate > 5, 4);

  const [ruptureOp, setRuptureOp] = useState(0);
  useEffect(() => {
    if (p.ruptured) {
      let v = 0;
      const iv = setInterval(() => { v = Math.min(0.88, v + 0.05); setRuptureOp(v); if (v >= 0.88) clearInterval(iv); }, 30);
      return () => clearInterval(iv);
    } else setRuptureOp(0);
  }, [p.ruptured]);

  const dischargeCol = p.ruptured ? C.closed : p.high_pressure_alarm ? C.warn : C.gas;
  const stressCol = p.pipe_stress > 75 ? C.closed : p.pipe_stress > 40 ? C.warn : C.energized;
  const suctionActive = p.suction_valve_open && p.compressor_rpm > 100;
  const dischargeActive = p.discharge_valve_open && p.compressor_rpm > 100 && !p.ruptured;

  return (
    <>
    <div ref={wrapRef} className="w-full mx-auto flex flex-col gap-3" style={{ maxWidth: MAX_CONTENT_W }}>
    <div className="flex bg-gray-950 rounded-lg overflow-hidden">
      <Stage width={stageW} height={stageH}>
        <Layer>
          <Group scaleX={scale} scaleY={scale}>
          <Rect x={0} y={0} width={W} height={H} fill={C.bg} />
          {Array.from({ length: 9 }, (_, i) => (
            <Line key={`v${i}`} points={[(i + 1) * 80, 0, (i + 1) * 80, H - 4]} stroke="#0d1829" strokeWidth={1} />
          ))}

          <Rect x={0} y={0} width={W} height={22} fill="#050c1a" />
          <Text x={0} y={6} width={W} align="center"
            text="MERIDIAN PIPELINE — COMPRESSOR STATION 7"
            fontSize={10} fontFamily="monospace" fontStyle="bold" fill="#6e4321" />

          {/* Suction header */}
          <Hoverable onHover={handleHover} onLeave={handleLeave} info={{
            title: "Upstream Pipeline",
            desc: "Incoming gas supply feeding the station at approximately 620 psi nominal suction pressure.",
          }}>
            <Text x={SUCTION_X - 10} y={PIPE_Y - 30} text="UPSTREAM" fontSize={8} fontFamily="monospace" fill={C.textDim} />
            <Text x={SUCTION_X - 10} y={PIPE_Y - 18} text="PIPELINE" fontSize={8} fontFamily="monospace" fill={C.textDim} />
          </Hoverable>
          <Line points={[SUCTION_X, PIPE_Y, SVALVE_X - 10, PIPE_Y]} stroke={p.suction_valve_open ? C.gas : C.gasDim} strokeWidth={4} />
          <FlowArrows x1={SUCTION_X} x2={SVALVE_X - 10} y={PIPE_Y} active={suctionActive} col={C.gas} />
          <Hoverable onHover={handleHover} onLeave={handleLeave} info={{
            title: "Suction Block Valve",
            desc: "Isolates the compressor from the upstream pipeline supply. Closing it starves the compressor of gas.",
            tag: "DNP3 G12V2 · Binary Output (attackable)",
          }}>
            <Valve x={SVALVE_X} y={PIPE_Y} open={p.suction_valve_open} id="SUCTION VLV" />
          </Hoverable>
          <Line points={[SVALVE_X + 10, PIPE_Y, COMP_X - COMP_R, PIPE_Y]} stroke={p.suction_valve_open ? C.gas : C.gasDim} strokeWidth={4} />

          {/* Compressor */}
          <Hoverable onHover={handleHover} onLeave={handleLeave} info={{
            title: "Centrifugal Compressor",
            desc: "Motor-driven compressor raising gas from suction (~620 psi) to discharge (~1,420 psi nominal). Overspeed drives vibration, temperature, and discharge pressure past safe limits.",
            tag: "DNP3 G40V0 · Analog Output (attackable)",
          }}>
            <Compressor x={COMP_X} y={PIPE_Y} r={COMP_R} rpm={p.compressor_rpm} vibration={p.vibration}
              tripped={p.esd_tripped} ruptured={p.ruptured} />
          </Hoverable>

          {/* Discharge header */}
          <Line points={[COMP_X + COMP_R, PIPE_Y, DVALVE_X, PIPE_Y]} stroke={dischargeCol} strokeWidth={4} />
          <FlowArrows x1={COMP_X + COMP_R} x2={DVALVE_X} y={PIPE_Y} active={dischargeActive} col={dischargeCol} />
          <Hoverable onHover={handleHover} onLeave={handleLeave} info={{
            title: "Discharge Block Valve",
            desc: "Routes compressed gas to the downstream pipeline. Closing it while the compressor runs risks a deadhead pressure spike.",
            tag: "DNP3 G12V3 · Binary Output (attackable)",
          }}>
            <Valve x={DVALVE_X} y={PIPE_Y} open={p.discharge_valve_open} id="DISCH VLV" />
          </Hoverable>
          <Line points={[DVALVE_X + 10, PIPE_Y, DOWNSTREAM_X, PIPE_Y]}
            stroke={p.discharge_valve_open ? dischargeCol : C.gasDim} strokeWidth={4} />
          <Hoverable onHover={handleHover} onLeave={handleLeave} info={{
            title: "Downstream Pipeline",
            desc: "Receives compressed gas for delivery onward to the next station or end customer.",
          }}>
            <Rect x={DOWNSTREAM_X} y={PIPE_Y - 20} width={50} height={40}
              fill="rgba(107,114,128,0.08)" stroke="#4b5563" strokeWidth={1} cornerRadius={3} />
            <Text x={DOWNSTREAM_X - 5} y={PIPE_Y + 24} width={60} align="center" text="DOWNSTREAM" fontSize={7} fontFamily="monospace" fill={C.textDim} />
          </Hoverable>

          {/* PRV branch */}
          <Line points={[PRV_STUB_X, PIPE_Y - 10, PRV_STUB_X, PIPE_Y - 60]}
            stroke={p.prv_relieving ? C.flame : "#4b5563"} strokeWidth={2.5} />
          <Hoverable onHover={handleHover} onLeave={handleLeave} info={{
            title: "PRV Isolation Valve",
            desc: "Isolates the mechanical Pressure Relief Valve (Layer 2 safety). Closing this removes the pipeline's last fail-safe — mirrors the real-world 'blocked-in relief valve' failure mode (e.g. BP Texas City, 2005).",
            tag: "DNP3 G12V1 · Binary Output (attackable)",
          }}>
            <Valve x={PRV_STUB_X} y={PIPE_Y - 75} open={!p.prv_block_valve_closed} id="PRV-BLK" vertical />
          </Hoverable>
          <Hoverable onHover={handleHover} onLeave={handleLeave} info={{
            title: "Mechanical Pressure Relief Valve (PRV)",
            desc: "Layer 2 safety — lifts automatically at 1,540 psi to vent excess pressure to atmosphere, independent of any electronics. Cannot be disabled directly, only isolated via its block valve.",
          }}>
            <VentStack x={PRV_STUB_X} topY={STACK_TOP_Y} bottomY={PIPE_Y - 85} active={p.prv_relieving} label="PRV (mech.)" />
          </Hoverable>

          {/* Blowdown branch */}
          <Line points={[BLOWDOWN_STUB_X, PIPE_Y - 10, BLOWDOWN_STUB_X, PIPE_Y - 60]}
            stroke={p.blowdown_valve_open ? C.flame : "#4b5563"} strokeWidth={2.5} />
          <Hoverable onHover={handleHover} onLeave={handleLeave} info={{
            title: "Blowdown / Emergency Vent Valve",
            desc: "Vents gas to atmosphere. Opens automatically when the ESD trips, or can be commanded open/closed manually.",
            tag: "DNP3 G12V4 · Binary Output (attackable)",
          }}>
            <Valve x={BLOWDOWN_STUB_X} y={PIPE_Y - 75} open={p.blowdown_valve_open} id="BLOWDOWN" vertical kind="vent" />
          </Hoverable>
          <Hoverable onHover={handleHover} onLeave={handleLeave} info={{
            title: "ESD Vent Stack",
            desc: "Atmospheric vent point for the blowdown valve. Flame/smoke indicates active venting.",
          }}>
            <VentStack x={BLOWDOWN_STUB_X} topY={STACK_TOP_Y} bottomY={PIPE_Y - 85} active={p.blowdown_valve_open} label="ESD Vent" />
          </Hoverable>

          {/* Flow particles (comet trails) */}
          <FlowStream x1={SUCTION_X} x2={COMP_X - COMP_R} y={PIPE_Y} particles={suctionFlow} col={C.gas} />
          <FlowStream x1={COMP_X + COMP_R} x2={DVALVE_X} y={PIPE_Y} particles={dischargeFlow} col={dischargeCol} />
          <FlowStream x1={DVALVE_X + 10} x2={DOWNSTREAM_X} y={PIPE_Y} particles={downstreamFlow} col={C.gas} />

          {/* Rupture shockwave */}
          <Shockwave x={COMP_X} y={PIPE_Y} active={p.ruptured} />

          {/* ESD / SIS status badge */}
          <Hoverable onHover={handleHover} onLeave={handleLeave} info={{
            title: "Emergency Shutdown System (Layer 1)",
            desc: "Electronic safety interlock. Trips the compressor and opens the blowdown valve on high-high pressure, overspeed, or high vibration — but only while armed.",
            tag: "DNP3 G12V0 · Binary Output (attackable)",
          }}>
            <Rect x={40} y={PIPE_Y + 55} width={170} height={34}
              fill={p.esd_armed ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.12)"}
              stroke={p.esd_armed ? C.energized : C.closed} strokeWidth={1} cornerRadius={4} />
            <Text x={48} y={PIPE_Y + 60} text="ESD / SIS (Layer 1)" fontSize={8} fontFamily="monospace" fill={C.textDim} />
            <Text x={48} y={PIPE_Y + 72} text={p.esd_armed ? "ARMED" : "BYPASSED — UNSAFE"}
              fontSize={10} fontFamily="monospace" fontStyle="bold"
              fill={p.esd_armed ? C.energized : C.closed} />
          </Hoverable>

          {ruptureOp > 0 && (
            <Group listening={false}>
              <Rect x={0} y={0} width={W} height={H} fill={`rgba(30,10,0,${ruptureOp})`} />
              {ruptureOp > 0.5 && (
                <>
                  <Text x={0} y={140} width={W} align="center" text="PIPELINE RUPTURE"
                    fontSize={40} fontFamily="monospace" fontStyle="bold" fill="rgba(239,68,68,0.9)" />
                  <Text x={0} y={195} width={W} align="center" text="UNCONTROLLED GAS RELEASE"
                    fontSize={14} fontFamily="monospace" fill="rgba(251,146,60,0.75)" />
                  <Text x={0} y={218} width={W} align="center" text={p.failure_mode ?? ""}
                    fontSize={11} fontFamily="monospace" fill="rgba(239,68,68,0.55)" />
                </>
              )}
            </Group>
          )}
          </Group>
        </Layer>
      </Stage>

      {/* Right measurement panel */}
      <div className="bg-gray-900 border-l border-gray-800 p-3 flex flex-col gap-2.5 text-xs font-mono overflow-y-auto flex-shrink-0"
        style={{ width: PANEL_W, minHeight: stageH }}>
        <div className="text-center border-b border-gray-700 pb-2">
          <div className="text-gray-500 text-[9px] uppercase tracking-widest">Meridian CS7 · Unit 1</div>
          <div className={`text-base font-bold mt-1 ${
            p.ruptured ? "text-red-500 animate-pulse" :
            p.pipe_stress > 50 || p.high_pressure_alarm ? "text-amber-400" : "text-green-400"
          }`}>
            {p.ruptured ? "RUPTURED" : p.esd_tripped ? "ESD TRIPPED" : p.pipe_stress > 50 ? "HIGH STRESS" : "NORMAL"}
          </div>
        </div>

        <div className={`rounded p-2 text-center border ${
          p.high_pressure_alarm ? "border-amber-700 bg-amber-900/10" : "border-gray-800 bg-gray-800/30"
        }`}>
          <div className="text-gray-500 text-[9px] uppercase tracking-widest">Discharge Pressure</div>
          <div className={`text-2xl font-bold tabular-nums ${p.high_pressure_alarm ? "text-amber-400" : "text-orange-400"}`}>
            {p.discharge_pressure.toFixed(0)}
          </div>
          <div className="text-gray-600 text-[9px]">psi · MAOP 1480</div>
        </div>

        <div>
          <div className="text-gray-600 text-[9px] uppercase tracking-widest mb-1">Process</div>
          <Row label="Suction" value={p.suction_pressure.toFixed(0)} unit="psi" col="#9ca3af" />
          <Row label="Flow" value={p.flow_rate.toFixed(0)} unit="MMSCFD" col="#9ca3af" />
          <Row label="Discharge Temp" value={p.discharge_temp.toFixed(0)} unit="°F" col={p.high_temp_alarm ? "#f59e0b" : "#9ca3af"} />
          <Row label="RPM Setpoint" value={p.rpm_setpoint.toFixed(0)} unit="RPM" col="#9ca3af" />
        </div>

        <div>
          <div className="text-gray-600 text-[9px] uppercase tracking-widest mb-1">Safety Layers</div>
          <Row label="ESD (Layer 1)" value={p.esd_armed ? "ARMED" : "BYPASSED"} unit="" col={p.esd_armed ? "#22c55e" : "#ef4444"} />
          <Row label="PRV Isolation" value={p.prv_block_valve_closed ? "BLOCKED" : "CLEAR"} unit="" col={p.prv_block_valve_closed ? "#ef4444" : "#22c55e"} />
          <Row label="ESD Tripped" value={p.esd_tripped ? "YES" : "no"} unit="" col={p.esd_tripped ? "#f59e0b" : "#6b7280"} />
          <Row label="PRV Relieving" value={p.prv_relieving ? "YES" : "no"} unit="" col={p.prv_relieving ? "#f59e0b" : "#6b7280"} />
        </div>

        <div>
          <div className="text-gray-600 text-[9px] uppercase tracking-widest mb-1">Valves</div>
          <Row label="Suction" value={p.suction_valve_open ? "OPEN" : "CLOSED"} unit="" col={p.suction_valve_open ? "#22c55e" : "#ef4444"} />
          <Row label="Discharge" value={p.discharge_valve_open ? "OPEN" : "CLOSED"} unit="" col={p.discharge_valve_open ? "#22c55e" : "#ef4444"} />
          <Row label="Blowdown" value={p.blowdown_valve_open ? "OPEN" : "CLOSED"} unit="" col={p.blowdown_valve_open ? "#f59e0b" : "#6b7280"} />
        </div>

        {p.telemetry_spoofed && (
          <div className="mt-1 p-2 rounded bg-purple-900/30 border border-purple-700 text-center">
            <div className="text-purple-300 font-bold text-[10px] font-mono">TELEMETRY SPOOFED</div>
            <div className="text-purple-500 text-[9px] font-mono">Ground truth hidden from HMI</div>
          </div>
        )}
      </div>
    </div>

    {/* Process readout + event log — directly below the diagram, compact, no scroll */}
    <div className="flex gap-3">
      <div className="flex-1 bg-gray-900 rounded-lg border border-gray-800 p-4 flex flex-wrap items-center gap-8">
        <div>
          <div className="text-[10px] text-gray-500 uppercase tracking-widest font-mono">Discharge Pressure</div>
          <div className="text-3xl font-mono font-bold tabular-nums" style={{ color: dischargeCol }}>
            {p.discharge_pressure.toFixed(0)}
          </div>
          <div className="text-[10px] text-gray-500 font-mono">psi · MAOP: 1480</div>
        </div>

        <div className="flex-1 min-w-[200px]">
          <div className="flex justify-between items-baseline mb-1">
            <span className="text-[10px] text-gray-500 uppercase tracking-widest font-mono">Pipe Stress Index</span>
            <span className="text-xs font-mono font-bold text-gray-200">{p.pipe_stress.toFixed(0)}%</span>
          </div>
          <div className="h-[11px] bg-gray-800 rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all" style={{
              width: `${Math.max(0, Math.min(100, p.pipe_stress))}%`, backgroundColor: stressCol,
            }} />
          </div>
          {p.prv_relieving && p.pipe_stress < 20 && (
            <div className="text-[9px] text-amber-500/80 font-mono mt-1">
              PRV is venting and capping pressure — stress won't climb until PRV isolation is also blocked
            </div>
          )}
        </div>

        <div>
          <div className="text-[10px] text-gray-500 uppercase tracking-widest font-mono">Vibration</div>
          <div className="text-2xl font-mono font-bold tabular-nums"
            style={{ color: p.vibration > 7 ? C.warn : C.textBright }}>
            {p.vibration.toFixed(1)} <span className="text-xs text-gray-500">mils</span>
          </div>
        </div>
      </div>

      <div className="w-[360px] flex-shrink-0 bg-gray-900 rounded-lg border border-orange-900/50 p-3">
        <div className="text-[10px] text-orange-600 uppercase tracking-widest font-mono font-bold mb-2">
          ▸ Compressor Event Log
        </div>
        <div className="space-y-0.5 max-h-28 overflow-y-auto">
          {[...(p.events ?? [])].reverse().map((ev, i) => (
            <div key={i} className={`text-[10px] font-mono ${
              ev.includes("CATASTROPHIC") || ev.includes("RUPTURE") ? "text-red-400" :
              ev.includes("TRIP") || ev.includes("LIFTED") ? "text-amber-400" :
              ev.includes("reseated") || ev.includes("normalized") ? "text-green-400" :
              "text-gray-500"
            }`}>
              {ev}
            </div>
          ))}
        </div>
      </div>
    </div>
    </div>

    {hover && <HoverTile info={hover.info} x={hover.x} y={hover.y} />}
    </>
  );
}

// ── Floating tooltip tile — follows the cursor, clamped to the viewport ────
function HoverTile({ info, x, y }: { info: HoverInfo; x: number; y: number }) {
  const TILE_W = 260;
  const left = Math.min(x + 16, window.innerWidth - TILE_W - 12);
  const top = Math.min(y + 16, window.innerHeight - 140);
  return (
    <div
      className="fixed z-50 pointer-events-none"
      style={{ left, top, width: TILE_W }}
    >
      <div className="bg-gray-900 border border-gray-700 rounded-lg shadow-xl p-3">
        <div className="text-xs font-mono font-bold text-gray-100 mb-1">{info.title}</div>
        <div className="text-[11px] font-mono text-gray-400 leading-snug">{info.desc}</div>
        {info.tag && (
          <div
            className="mt-2 inline-block text-[9px] font-mono font-bold px-1.5 py-0.5 rounded"
            style={{
              color: info.tagColor ?? "#f59e0b",
              border: `1px solid ${info.tagColor ?? "#f59e0b"}55`,
              background: `${info.tagColor ?? "#f59e0b"}15`,
            }}
          >
            {info.tag}
          </div>
        )}
      </div>
    </div>
  );
}
