/**
 * SubstationView v2 — Animated Single-Line Diagram (SLD)
 * Copperline 230/115kV Regional Substation
 */

import { useEffect, useRef, useState } from "react";
import { Stage, Layer, Rect, Circle, Line, Text, Group } from "react-konva";
import type { GridState } from "../../types/process";

interface Props { grid: GridState }

// ── Palette ───────────────────────────────────────────────────────────────
const C = {
  hvBus:     "#f59e0b",
  lvBus:     "#60a5fa",
  energized: "#22c55e",
  tripped:   "#ef4444",
  warn:      "#f59e0b",
  bg:        "#030712",
  textDim:   "#6b7280",
  textMid:   "#9ca3af",
  textBright:"#e5e7eb",
  flow:      "#86efac",
  glowGreen: "rgba(34,197,94,0.10)",
  glowAmber: "rgba(245,158,11,0.14)",
  glowRed:   "rgba(239,68,68,0.15)",
};

// ── Canvas & layout constants ─────────────────────────────────────────────
const W = 720, H = 650, PANEL_W = 200;

/**
 * Measure the container so the scene fills the remaining viewport: full
 * width, and height locked to the remaining space below it (so it never
 * scrolls) — same technique used by DamView / IntersectionView.
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

const HV_Y    = 135;  // 230kV bus center-y
const LV_Y    = 325;  // 115kV bus center-y
const BUS_L   = 80;   // bus left x
const BUS_R   = 650;  // bus right x

const SRC1_X  = 180;  // Source 1 / CB1
const SRC2_X  = 540;  // Source 2 / CB2
const TX1_X   = 278;  // TX1 / CB3
const TX2_X   = 442;  // TX2 / CB4
const FA_X    = 180;  // Feeder A / CB5
const FB_X    = 360;  // Feeder B / CB6
const FC_X    = 540;  // Feeder C / CB7

const SRC_TOP  = 48;  // top of incoming lines
const CB12_Y   = 88;  // source CBs
const CB34_Y   = 182; // transformer HV-side CBs
const TX_Y     = 240; // transformer symbol center
const TX_R     = 15;  // transformer coil radius
const CB567_Y  = 372; // feeder CBs
const LOAD_Y   = 416; // top of load zone boxes
const INFO_Y   = 475; // bottom info band start

// ── Flow particles ────────────────────────────────────────────────────────
interface Particle { id: number; t: number; speed: number }

function useParticles(on: boolean, n = 4) {
  const [ps, setPs] = useState<Particle[]>(() =>
    Array.from({ length: n }, (_, i) => ({
      id: i, t: i / n, speed: 0.003 + i * 0.0005,
    }))
  );
  const raf = useRef<number>();
  useEffect(() => {
    if (!on) { return; }
    const step = () => {
      setPs(prev => prev.map(p => ({ ...p, t: (p.t + p.speed) % 1 })));
      raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [on]);
  return ps;
}

// ── CB Symbol — label to the RIGHT of box ────────────────────────────────
function CB({ x, y, closed, id }: { x: number; y: number; closed: boolean; id: string }) {
  const col = closed ? C.energized : C.tripped;
  const S   = 11;
  return (
    <Group>
      <Rect
        x={x - S} y={y - S} width={2 * S} height={2 * S}
        fill={closed ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.10)"}
        stroke={col} strokeWidth={1.5} cornerRadius={2}
      />
      {!closed ? (
        <>
          <Line points={[x - 5, y - 5, x + 5, y + 5]} stroke={col} strokeWidth={1.5} />
          <Line points={[x + 5, y - 5, x - 5, y + 5]} stroke={col} strokeWidth={1.5} />
        </>
      ) : (
        <Line points={[x, y - 5, x, y + 5]} stroke={col} strokeWidth={2.5} />
      )}
      {/* Label to the right — avoids vertical line overlap */}
      <Text x={x + S + 3} y={y - 5} text={id} fontSize={11} fontFamily="monospace" fill={col} />
    </Group>
  );
}

// ── Transformer — coils + labels to the RIGHT ─────────────────────────────
function Transformer({ x, y, loadPct, temp, tripped, id }: {
  x: number; y: number; loadPct: number; temp: number; tripped: boolean; id: string;
}) {
  const r    = TX_R;
  const gap  = 2;
  const topY = y - r - gap;
  const botY = y + r + gap;
  const lc   = loadPct > 85 ? C.tripped : loadPct > 65 ? C.warn : C.energized;
  const tc   = temp > 95    ? C.tripped : temp > 75    ? C.warn : C.energized;
  const bc   = tripped ? C.tripped : lc;
  const tx   = x + r + 12;  // text x anchor

  return (
    <Group>
      {/* Ambient glow */}
      <Circle x={x} y={y} radius={r + 14}
        fill={tripped ? C.glowRed : loadPct > 85 ? C.glowRed : C.glowGreen}
      />
      {/* HV coil (top, amber tint) */}
      <Circle x={x} y={topY} radius={r}
        stroke={bc} strokeWidth={2}
        fill={tripped ? "rgba(239,68,68,0.05)" : "rgba(245,158,11,0.06)"}
      />
      {/* LV coil (bottom, blue tint) */}
      <Circle x={x} y={botY} radius={r}
        stroke={bc} strokeWidth={2}
        fill={tripped ? "rgba(239,68,68,0.05)" : "rgba(96,165,250,0.06)"}
      />
      {/* Labels — all to the right, stacked vertically */}
      <Text x={tx} y={y - 22} text={id}              fontSize={14} fontFamily="monospace" fontStyle="bold" fill={bc} />
      <Text x={tx} y={y -  7} text={`${loadPct.toFixed(0)}%`} fontSize={13} fontFamily="monospace" fill={lc} />
      <Text x={tx} y={y +  7} text={`${temp.toFixed(0)}°C`}   fontSize={12}  fontFamily="monospace" fill={tc} />
      {tripped && (
        <Text x={tx} y={y + 20} text="TRIPPED" fontSize={11} fontFamily="monospace" fontStyle="bold" fill={C.tripped} />
      )}
    </Group>
  );
}

// ── Load zone box — 90px wide so labels fit ──────────────────────────────
function LoadBox({ x, y, live, name, zone, mw }: {
  x: number; y: number; live: boolean; name: string; zone: string; mw: number;
}) {
  const col = live ? C.energized : C.tripped;
  const BW = 90, BH = 46;
  return (
    <Group>
      <Rect
        x={x - BW / 2} y={y} width={BW} height={BH}
        fill={live ? "rgba(34,197,94,0.06)" : "rgba(239,68,68,0.06)"}
        stroke={col} strokeWidth={1.2} cornerRadius={4}
      />
      <Text x={x - BW / 2 + 4} y={y +  6} text={name}
        fontSize={11} fontFamily="monospace" fontStyle="bold"
        fill={col} width={BW - 8} align="center" />
      <Text x={x - BW / 2 + 4} y={y + 19} text={zone}
        fontSize={10} fontFamily="monospace" fill={C.textDim} width={BW - 8} align="center" />
      <Text x={x - BW / 2 + 4} y={y + 31} text={`${mw} MW`}
        fontSize={11} fontFamily="monospace"
        fill={live ? C.textBright : C.textDim} width={BW - 8} align="center" />
    </Group>
  );
}

// ── Animated power-flow dot ───────────────────────────────────────────────
function Dot({ x1, y1, x2, y2, t, col }: {
  x1: number; y1: number; x2: number; y2: number; t: number; col: string;
}) {
  return (
    <Circle
      x={x1 + (x2 - x1) * t}
      y={y1 + (y2 - y1) * t}
      radius={2.5} fill={col} opacity={0.85}
    />
  );
}

// ── Bus tap node ──────────────────────────────────────────────────────────
function Tap({ x, y, col }: { x: number; y: number; col: string }) {
  return <Circle x={x} y={y} radius={4.5} fill={col} />;
}

// ── Right-panel measurement row ───────────────────────────────────────────
function Row({ label, value, unit, col }: {
  label: string; value: string; unit: string; col: string;
}) {
  return (
    <div className="flex justify-between items-center py-[3px] border-b border-gray-800">
      <span className="text-gray-500 text-[10px] font-mono">{label}</span>
      <span className="font-mono text-[10px] font-bold" style={{ color: col }}>
        {value}<span className="text-gray-600 font-normal ml-0.5">{unit}</span>
      </span>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────
export function SubstationView({ grid }: Props) {
  const [wrapRef, box] = useContainerBox<HTMLDivElement>();
  const availW = Math.max(360, (box.w || W + PANEL_W) - PANEL_W);
  const availH = box.h || H;
  const scale  = Math.min(availW / W, availH / H);
  const stageW = Math.round(W * scale);
  const stageH = Math.round(H * scale);

  const cb = grid.cb_states ?? Array(7).fill(true);

  // Topology liveness
  const hvOn  = grid.source1_connected || grid.source2_connected;
  const tx1On = hvOn && cb[2] && !grid.tx1_tripped;
  const tx2On = hvOn && cb[3] && !grid.tx2_tripped;
  const lvOn  = tx1On || tx2On;

  const s1col = cb[0] ? C.energized : C.tripped;
  const s2col = cb[1] ? C.energized : C.tripped;
  const hvCol = hvOn  ? C.hvBus     : "#4b5563";
  const lvCol = lvOn  ? C.lvBus     : "#4b5563";
  const t1col = tx1On ? C.energized : C.tripped;
  const t2col = tx2On ? C.energized : C.tripped;

  // Flow particles
  const s1p = useParticles(!!cb[0], 4);
  const s2p = useParticles(!!cb[1], 4);
  const t1p = useParticles(tx1On,   5);
  const t2p = useParticles(tx2On,   5);
  const fap = useParticles(grid.feeder_a_live, 3);
  const fbp = useParticles(grid.feeder_b_live, 3);
  const fcp = useParticles(grid.feeder_c_live, 3);

  // Blackout fade-in
  const [bkOp, setBkOp] = useState(0);
  useEffect(() => {
    if (grid.blackout) {
      let v = 0;
      const iv = setInterval(() => {
        v = Math.min(0.9, v + 0.04);
        setBkOp(v);
        if (v >= 0.9) clearInterval(iv);
      }, 30);
      return () => clearInterval(iv);
    } else {
      setBkOp(0);
    }
  }, [grid.blackout]);

  const fCol = grid.frequency < 58.5 ? C.tripped : grid.frequency < 59.5 ? C.warn : C.energized;
  const sCol = grid.grid_stress > 75  ? C.tripped : grid.grid_stress > 45  ? C.warn : C.energized;

  // Transformer line connection points (top of HV coil / bottom of LV coil)
  const TX_CONN_TOP = TX_Y - 2 * TX_R - 2;   // 240 - 32 = 208
  const TX_CONN_BOT = TX_Y + 2 * TX_R + 2;   // 240 + 32 = 272

  return (
    <div ref={wrapRef} className="flex justify-center w-full bg-gray-950 rounded-lg overflow-hidden">

      {/* ── Konva SLD canvas ──────────────────────────────────────── */}
      <Stage width={stageW} height={stageH}>
        <Layer>
        <Group scaleX={scale} scaleY={scale}>

          {/* Background */}
          <Rect x={0} y={0} width={W} height={H} fill={C.bg} />

          {/* Subtle grid lines for depth */}
          {Array.from({ length: 9 }, (_, i) => (
            <Line key={`v${i}`}
              points={[(i + 1) * 80, 0, (i + 1) * 80, INFO_Y - 4]}
              stroke="#0d1829" strokeWidth={1}
            />
          ))}
          {Array.from({ length: 6 }, (_, i) => (
            <Line key={`h${i}`}
              points={[0, (i + 1) * 70, W, (i + 1) * 70]}
              stroke="#0d1829" strokeWidth={1}
            />
          ))}

          {/* Title bar */}
          <Rect x={0} y={0} width={W} height={22} fill="#050c1a" />
          <Text x={0} y={6} width={W}
            text="COPPERLINE REGIONAL SUBSTATION  —  230 / 115 kV"
            fontSize={13} fontFamily="monospace" fontStyle="bold"
            fill="#2d4a6e" align="center"
          />

          {/* ── SOURCE 1 (top-left) ──────────────────────────────── */}
          <Text x={SRC1_X - 50} y={25} text="◈ SOURCE 1" fontSize={11}
            fontFamily="monospace" fontStyle="bold" fill={s1col} width={100} align="center" />
          <Text x={SRC1_X - 50} y={37} text="GEN · 165 MW" fontSize={10}
            fontFamily="monospace" fill={C.textDim} width={100} align="center" />
          <Line points={[SRC1_X, SRC_TOP, SRC1_X, CB12_Y - 11]}
            stroke={s1col} strokeWidth={2} />
          <CB x={SRC1_X} y={CB12_Y} closed={!!cb[0]} id="CB1" />
          <Line points={[SRC1_X, CB12_Y + 11, SRC1_X, HV_Y - 4]}
            stroke={s1col} strokeWidth={2} />

          {/* ── SOURCE 2 (top-right) ─────────────────────────────── */}
          <Text x={SRC2_X - 50} y={25} text="◈ SOURCE 2" fontSize={11}
            fontFamily="monospace" fontStyle="bold" fill={s2col} width={100} align="center" />
          <Text x={SRC2_X - 50} y={37} text="GRID · 135 MW" fontSize={10}
            fontFamily="monospace" fill={C.textDim} width={100} align="center" />
          <Line points={[SRC2_X, SRC_TOP, SRC2_X, CB12_Y - 11]}
            stroke={s2col} strokeWidth={2} />
          <CB x={SRC2_X} y={CB12_Y} closed={!!cb[1]} id="CB2" />
          <Line points={[SRC2_X, CB12_Y + 11, SRC2_X, HV_Y - 4]}
            stroke={s2col} strokeWidth={2} />

          {/* ── 230kV HV Bus ─────────────────────────────────────── */}
          {hvOn && (
            <Rect x={BUS_L - 8} y={HV_Y - 10} width={BUS_R - BUS_L + 16} height={20}
              fill={C.glowAmber} cornerRadius={4}
            />
          )}
          <Rect x={BUS_L} y={HV_Y - 4} width={BUS_R - BUS_L} height={8}
            fill={hvCol} cornerRadius={3}
          />
          <Text x={14} y={HV_Y - 7} text="230kV" fontSize={12}
            fontFamily="monospace" fontStyle="bold" fill={hvCol} />
          <Text x={14} y={HV_Y + 4} text="HV BUS" fontSize={10}
            fontFamily="monospace" fill={C.textDim} />
          {/* Tap nodes */}
          {[SRC1_X, TX1_X, TX2_X, SRC2_X].map(x => (
            <Tap key={x} x={x} y={HV_Y} col={hvCol} />
          ))}

          {/* ── TX1 branch ───────────────────────────────────────── */}
          <Line points={[TX1_X, HV_Y + 4, TX1_X, CB34_Y - 11]}
            stroke={t1col} strokeWidth={2} />
          <CB x={TX1_X} y={CB34_Y} closed={!!cb[2]} id="CB3" />
          <Line points={[TX1_X, CB34_Y + 11, TX1_X, TX_CONN_TOP]}
            stroke={t1col} strokeWidth={2} />
          <Transformer
            x={TX1_X} y={TX_Y}
            loadPct={grid.tx1_load_pct} temp={grid.tx1_temp}
            tripped={grid.tx1_tripped} id="TX1"
          />
          <Line points={[TX1_X, TX_CONN_BOT, TX1_X, LV_Y - 3]}
            stroke={t1col} strokeWidth={2} />

          {/* ── TX2 branch ───────────────────────────────────────── */}
          <Line points={[TX2_X, HV_Y + 4, TX2_X, CB34_Y - 11]}
            stroke={t2col} strokeWidth={2} />
          <CB x={TX2_X} y={CB34_Y} closed={!!cb[3]} id="CB4" />
          <Line points={[TX2_X, CB34_Y + 11, TX2_X, TX_CONN_TOP]}
            stroke={t2col} strokeWidth={2} />
          <Transformer
            x={TX2_X} y={TX_Y}
            loadPct={grid.tx2_load_pct} temp={grid.tx2_temp}
            tripped={grid.tx2_tripped} id="TX2"
          />
          <Line points={[TX2_X, TX_CONN_BOT, TX2_X, LV_Y - 3]}
            stroke={t2col} strokeWidth={2} />

          {/* ── 115kV LV Bus ─────────────────────────────────────── */}
          {lvOn && (
            <Rect x={BUS_L - 8} y={LV_Y - 8} width={BUS_R - BUS_L + 16} height={16}
              fill="rgba(96,165,250,0.07)" cornerRadius={3}
            />
          )}
          <Rect x={BUS_L} y={LV_Y - 3} width={BUS_R - BUS_L} height={6}
            fill={lvCol} cornerRadius={2}
          />
          <Text x={14} y={LV_Y - 5} text="115kV" fontSize={12}
            fontFamily="monospace" fontStyle="bold" fill={lvCol} />
          <Text x={14} y={LV_Y + 4} text="LV BUS" fontSize={10}
            fontFamily="monospace" fill={C.textDim} />
          {/* Tap nodes */}
          {[TX1_X, TX2_X, FA_X, FB_X, FC_X].map(x => (
            <Tap key={x} x={x} y={LV_Y} col={lvCol} />
          ))}

          {/* ── Feeder A ─────────────────────────────────────────── */}
          <Line points={[FA_X, LV_Y + 3, FA_X, CB567_Y - 11]}
            stroke={grid.feeder_a_live ? lvCol : C.tripped} strokeWidth={1.8} />
          <CB x={FA_X} y={CB567_Y} closed={!!cb[4]} id="CB5" />
          <Line points={[FA_X, CB567_Y + 11, FA_X, LOAD_Y]}
            stroke={grid.feeder_a_live ? C.energized : C.tripped} strokeWidth={1.8} />
          <LoadBox x={FA_X} y={LOAD_Y} live={grid.feeder_a_live}
            name="INDUSTRIAL" zone="Zone A" mw={80} />

          {/* ── Feeder B ─────────────────────────────────────────── */}
          <Line points={[FB_X, LV_Y + 3, FB_X, CB567_Y - 11]}
            stroke={grid.feeder_b_live ? lvCol : C.tripped} strokeWidth={1.8} />
          <CB x={FB_X} y={CB567_Y} closed={!!cb[5]} id="CB6" />
          <Line points={[FB_X, CB567_Y + 11, FB_X, LOAD_Y]}
            stroke={grid.feeder_b_live ? C.energized : C.tripped} strokeWidth={1.8} />
          <LoadBox x={FB_X} y={LOAD_Y} live={grid.feeder_b_live}
            name="RESIDENTIAL" zone="Zone B" mw={65} />

          {/* ── Feeder C ─────────────────────────────────────────── */}
          <Line points={[FC_X, LV_Y + 3, FC_X, CB567_Y - 11]}
            stroke={grid.feeder_c_live ? lvCol : C.tripped} strokeWidth={1.8} />
          <CB x={FC_X} y={CB567_Y} closed={!!cb[6]} id="CB7" />
          <Line points={[FC_X, CB567_Y + 11, FC_X, LOAD_Y]}
            stroke={grid.feeder_c_live ? C.energized : C.tripped} strokeWidth={1.8} />
          <LoadBox x={FC_X} y={LOAD_Y} live={grid.feeder_c_live}
            name="CRITICAL" zone="Zone C" mw={45} />

          {/* ── Flow particles ────────────────────────────────────── */}
          {s1p.map(p => <Dot key={p.id} x1={SRC1_X} y1={SRC_TOP} x2={SRC1_X} y2={HV_Y} t={p.t} col={C.flow} />)}
          {s2p.map(p => <Dot key={p.id} x1={SRC2_X} y1={SRC_TOP} x2={SRC2_X} y2={HV_Y} t={p.t} col={C.flow} />)}
          {t1p.map(p => <Dot key={p.id} x1={TX1_X} y1={HV_Y} x2={TX1_X} y2={LV_Y} t={p.t} col={C.flow} />)}
          {t2p.map(p => <Dot key={p.id} x1={TX2_X} y1={HV_Y} x2={TX2_X} y2={LV_Y} t={p.t} col={C.flow} />)}
          {fap.map(p => <Dot key={p.id} x1={FA_X} y1={LV_Y} x2={FA_X} y2={LOAD_Y + 46} t={p.t} col={C.flow} />)}
          {fbp.map(p => <Dot key={p.id} x1={FB_X} y1={LV_Y} x2={FB_X} y2={LOAD_Y + 46} t={p.t} col={C.flow} />)}
          {fcp.map(p => <Dot key={p.id} x1={FC_X} y1={LV_Y} x2={FC_X} y2={LOAD_Y + 46} t={p.t} col={C.flow} />)}

          {/* ── Bottom info band ──────────────────────────────────── */}
          <Rect x={0} y={INFO_Y} width={W} height={H - INFO_Y} fill="#060c18" />
          <Line points={[0, INFO_Y, W, INFO_Y]} stroke="#1e3a5f" strokeWidth={1} />

          {/* Left column — Frequency */}
          <Text x={20} y={INFO_Y + 6}  text="SYSTEM FREQUENCY" fontSize={11} fontFamily="monospace" fill={C.textDim} />
          <Text x={18} y={INFO_Y + 20} text={grid.frequency.toFixed(3)}
            fontSize={30} fontFamily="monospace" fontStyle="bold" fill={fCol} />
          <Text x={20} y={INFO_Y + 55} text="Hz  ·  NOMINAL: 60.000"
            fontSize={11} fontFamily="monospace" fill={C.textDim} />
          <Text x={20} y={INFO_Y + 68}
            text={grid.frequency < 59.9 ? "▼ UNDER-FREQUENCY DEVIATION" : "● FREQUENCY STABLE"}
            fontSize={10} fontFamily="monospace" fill={fCol} />

          {/* Center column — Grid stress + Active power */}
          <Text x={210} y={INFO_Y + 6} text="GRID STRESS" fontSize={11} fontFamily="monospace" fill={C.textDim} />
          <Rect x={210} y={INFO_Y + 20} width={200} height={11} fill="#1f2937" cornerRadius={5} />
          <Rect x={210} y={INFO_Y + 20}
            width={Math.max(0, Math.min(200, (grid.grid_stress / 100) * 200))} height={11}
            fill={sCol} cornerRadius={5}
          />
          <Text x={418} y={INFO_Y + 18} text={`${grid.grid_stress.toFixed(0)}%`}
            fontSize={12} fontFamily="monospace" fill={C.textBright} />

          <Text x={210} y={INFO_Y + 42} text="ACTIVE POWER" fontSize={11} fontFamily="monospace" fill={C.textDim} />
          <Text x={210} y={INFO_Y + 54}
            text={`${grid.active_power.toFixed(0)} MW`}
            fontSize={16} fontFamily="monospace" fontStyle="bold"
            fill={grid.active_power > 150 ? C.warn : C.textBright}
          />
          <Text x={210} y={INFO_Y + 76}
            text={`PF: ${grid.power_factor.toFixed(3)}   Q: ${grid.reactive_power.toFixed(0)} MVAR`}
            fontSize={10} fontFamily="monospace" fill={C.textDim}
          />

          {/* Right column — Event log */}
          <Rect x={452} y={INFO_Y + 2} width={W - 456} height={H - INFO_Y - 4}
            fill="#040c1a" stroke="#1a3352" strokeWidth={0.5} cornerRadius={3}
          />
          <Text x={460} y={INFO_Y + 8} text="▸ SCADA EVENT LOG"
            fontSize={11} fontFamily="monospace" fontStyle="bold" fill="#3b82f6" />
          {(grid.events ?? []).slice(-6).map((ev, i) => (
            <Text key={i} x={460} y={INFO_Y + 24 + i * 12} text={ev}
              fontSize={10} fontFamily="monospace"
              fill={
                ev.includes("BLACKOUT") || ev.includes("TRIP") ? C.tripped :
                ev.includes("CLOSE")    || ev.includes("RECOVERY") ? C.energized :
                ev.includes("WARN")     || ev.includes("OVERLOAD")  ? C.warn :
                C.textDim
              }
            />
          ))}

          {/* ── Blackout overlay ──────────────────────────────────── */}
          {bkOp > 0 && (
            <>
              <Rect x={0} y={0} width={W} height={H} fill={`rgba(0,0,0,${bkOp})`} />
              {bkOp > 0.5 && (
                <>
                  <Text x={0} y={190} width={W}
                    text="BLACKOUT"
                    fontSize={72} fontFamily="monospace" fontStyle="bold"
                    fill="rgba(239,68,68,0.9)" align="center"
                  />
                  <Text x={0} y={275} width={W}
                    text="TOTAL LOSS OF SUPPLY"
                    fontSize={18} fontFamily="monospace"
                    fill="rgba(239,68,68,0.7)" align="center"
                  />
                  <Text x={0} y={312} width={W}
                    text="190 MW — ALL FEEDER ZONES DARK"
                    fontSize={15} fontFamily="monospace"
                    fill="rgba(239,68,68,0.5)" align="center"
                  />
                </>
              )}
            </>
          )}

        </Group>
        </Layer>
      </Stage>

      {/* ── Right measurement panel ───────────────────────────────────── */}
      <div className="bg-gray-900 border-l border-gray-800 p-3 flex flex-col gap-2.5 text-xs font-mono overflow-y-auto flex-shrink-0" style={{ width: PANEL_W, minHeight: stageH }}>

        {/* Status header */}
        <div className="text-center border-b border-gray-700 pb-2">
          <div className="text-gray-500 text-[9px] uppercase tracking-widest">Copperline IED · Unit 1</div>
          <div className={`text-base font-bold mt-1 ${
            grid.blackout        ? "text-red-500 animate-pulse" :
            grid.grid_stress > 60 ? "text-amber-400" : "text-green-400"
          }`}>
            {grid.blackout ? "BLACKOUT" : grid.grid_stress > 60 ? "HIGH STRESS" : "NORMAL"}
          </div>
        </div>

        {/* Frequency badge */}
        <div className={`rounded p-2 text-center border ${
          grid.frequency < 58.5 ? "border-red-700 bg-red-900/20" :
          grid.frequency < 59.5 ? "border-amber-700 bg-amber-900/10" :
          "border-green-800 bg-green-900/10"
        }`}>
          <div className="text-gray-500 text-[9px] uppercase tracking-widest">Frequency</div>
          <div className={`text-2xl font-bold tabular-nums ${
            grid.frequency < 58.5 ? "text-red-400" :
            grid.frequency < 59.5 ? "text-amber-400" : "text-green-400"
          }`}>
            {grid.frequency > 0 ? grid.frequency.toFixed(2) : "---"}
          </div>
          <div className="text-gray-600 text-[9px]">Hz · Nominal 60.000</div>
        </div>

        {/* Bus voltages */}
        <div>
          <div className="text-gray-600 text-[9px] uppercase tracking-widest mb-1">Bus Voltages</div>
          <Row
            label="230kV Bus"
            value={grid.hv_voltage > 0 ? grid.hv_voltage.toFixed(0) : "---"}
            unit="kV"
            col={grid.hv_voltage > 200 ? "#f59e0b" : grid.hv_voltage > 0 ? "#60a5fa" : "#4b5563"}
          />
          <Row
            label="115kV Bus"
            value={grid.lv_voltage > 0 ? grid.lv_voltage.toFixed(0) : "---"}
            unit="kV"
            col={grid.lv_voltage > 100 ? "#60a5fa" : grid.lv_voltage > 0 ? "#f59e0b" : "#4b5563"}
          />
        </div>

        {/* Transformer loading */}
        <div>
          <div className="text-gray-600 text-[9px] uppercase tracking-widest mb-1">Transformers</div>
          {[
            { id: "TX1 300MVA", l: grid.tx1_load_pct, t: grid.tx1_temp, trip: grid.tx1_tripped },
            { id: "TX2 200MVA", l: grid.tx2_load_pct, t: grid.tx2_temp, trip: grid.tx2_tripped },
          ].map(tx => (
            <div key={tx.id} className={`rounded p-1.5 border mb-1.5 ${
              tx.trip  ? "border-red-800 bg-red-900/20" :
              tx.l > 85 ? "border-amber-800 bg-amber-900/10" :
              "border-gray-800 bg-gray-800/30"
            }`}>
              <div className="flex justify-between items-center">
                <span className={tx.trip ? "text-red-400" : "text-gray-300"}>{tx.id}</span>
                <span className={
                  tx.trip  ? "text-red-400 text-[9px]" :
                  tx.l > 85 ? "text-amber-400 text-[9px]" : "text-green-400 text-[9px]"
                }>{tx.trip ? "TRIP" : `${tx.l.toFixed(0)}%`}</span>
              </div>
              {!tx.trip && (
                <>
                  <div className="h-1.5 bg-gray-700 rounded-full mt-1 overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{
                      width: `${Math.min(100, tx.l)}%`,
                      backgroundColor: tx.l > 85 ? "#ef4444" : tx.l > 65 ? "#f59e0b" : "#22c55e",
                    }} />
                  </div>
                  <div className="text-[8px] text-gray-500 mt-0.5">
                    {tx.t.toFixed(0)}°C
                    {tx.t > 95 && <span className="text-red-400"> HOT</span>}
                    {tx.t > 75 && tx.t <= 95 && <span className="text-amber-400"> WARM</span>}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>

        {/* Power flow */}
        <div>
          <div className="text-gray-600 text-[9px] uppercase tracking-widest mb-1">Power Flow</div>
          <Row label="Active"   value={grid.active_power.toFixed(0)}   unit="MW"   col={grid.active_power > 0 ? "#e5e7eb" : "#4b5563"} />
          <Row label="Reactive" value={grid.reactive_power.toFixed(0)} unit="MVAR" col="#9ca3af" />
          <Row label="PF"       value={grid.power_factor.toFixed(3)}   unit=""     col="#9ca3af" />
        </div>

        {/* Protection relays */}
        <div>
          <div className="text-gray-600 text-[9px] uppercase tracking-widest mb-1">Protection</div>
          {[
            { n: "Master Prot",  v: grid.protection_enabled },
            { n: "Differential", v: grid.diff_prot_enabled },
            { n: "Overcurrent",  v: grid.overcurrent_enabled },
            { n: "Under-Freq",   v: grid.underfreq_enabled },
            { n: "Auto-Reclosr", v: grid.autorecloser_enabled },
          ].map(p => (
            <div key={p.n} className="flex justify-between items-center py-0.5">
              <span className="text-gray-500 text-[9px]">{p.n}</span>
              <span className={`text-[9px] font-bold ${p.v ? "text-green-500" : "text-red-400"}`}>
                {p.v ? "ON" : "OFF"}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
