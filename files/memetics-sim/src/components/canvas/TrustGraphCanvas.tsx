import { useRef } from 'react';
import { useCanvas, type Frame } from './useCanvas';
import { useSimStore } from '../../store/useSimStore';
import { ramp } from '../palette';
import { trustIn } from '../../core/types/Agent';

const BG = '#080808';
const BINS = 18;

interface Layout {
  xs: Float32Array;
  ys: Float32Array;
  signature: string;
  edges: Int32Array;
}

/**
 * Mode B — the trust topology. Nodes sit on a community-ordered annulus so the
 * small-world ring structure stays legible; edge colour and thickness track the
 * live mutual trust T_{j->i}, and each broadcast fires a pulse along its edge
 * (cyan for rational payloads, crimson for irrational ones).
 */
export default function TrustGraphCanvas() {
  const layoutRef = useRef<Layout | null>(null);
  const hover = useRef<number | null>(null);
  const hit = useRef<{ w: number; h: number; r: number } | null>(null);

  const canvasRef = useCanvas((frame: Frame) => {
    const { ctx, width, height, phase } = frame;
    const { engine, selectedAgent } = useSimStore.getState();
    const agents = engine.agents;

    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, width, height);
    if (agents.length === 0) return;

    const layout = ensureLayout(layoutRef, engine);
    const radius = Math.min(width, height) / 2 - 26;
    const cx = width / 2;
    const cy = height / 2;
    hit.current = { w: width, h: height, r: radius };
    const sx = (i: number) => cx + layout.xs[i] * radius;
    const sy = (i: number) => cy + layout.ys[i] * radius;

    // --- edges, batched by trust bin ----------------------------------------
    const edges = layout.edges;
    const buckets: number[][] = Array.from({ length: BINS }, () => []);
    for (let e = 0; e < edges.length; e += 2) {
      const i = edges[e];
      const j = edges[e + 1];
      const t = (trustIn(agents[i], agents[j].id) + trustIn(agents[j], agents[i].id)) / 2;
      buckets[Math.min(BINS - 1, Math.floor(t * BINS))].push(e);
    }
    for (let bin = 0; bin < BINS; bin++) {
      const list = buckets[bin];
      if (list.length === 0) continue;
      const t = (bin + 0.5) / BINS;
      // Low trust reads cold and faint; high trust reads bright and heavy.
      const alpha = 0.05 + 0.5 * Math.pow(t, 1.6);
      ctx.strokeStyle = `rgba(${Math.round(110 + 130 * t)},${Math.round(110 + 130 * t)},${Math.round(110 + 130 * t)},${alpha.toFixed(3)})`;
      ctx.lineWidth = 0.3 + 2.2 * Math.pow(t, 2);
      ctx.beginPath();
      for (const e of list) {
        ctx.moveTo(sx(edges[e]), sy(edges[e]));
        ctx.lineTo(sx(edges[e + 1]), sy(edges[e + 1]));
      }
      ctx.stroke();
    }

    // --- broadcast pulses ----------------------------------------------------
    const tick = engine.tick;
    for (const pulse of engine.pulses) {
      const age = tick - pulse.born + phase;
      if (age < 0 || age > 2.4) continue;
      const progress = Math.min(1, age / 1.6);
      const x0 = sx(pulse.from);
      const y0 = sy(pulse.from);
      const x1 = sx(pulse.to);
      const y1 = sy(pulse.to);
      const [r, g, b] = ramp(pulse.irrationality);
      const fade = 1 - Math.max(0, (age - 1.6) / 0.8);
      ctx.strokeStyle = `rgba(${r},${g},${b},${(pulse.accepted ? 0.85 : 0.3) * fade})`;
      ctx.lineWidth = pulse.accepted ? 1.8 : 0.9;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      const tail = Math.max(0, progress - 0.28);
      ctx.moveTo(x0 + (x1 - x0) * tail, y0 + (y1 - y0) * tail);
      ctx.lineTo(x0 + (x1 - x0) * progress, y0 + (y1 - y0) * progress);
      ctx.stroke();
    }

    // --- nodes, batched by rigor bin ----------------------------------------
    for (let bin = 0; bin < BINS; bin++) {
      const [r, g, b] = ramp(1 - (bin + 0.5) / BINS);
      ctx.fillStyle = `rgba(${r},${g},${b},0.95)`;
      ctx.beginPath();
      let drew = false;
      for (const a of agents) {
        if (Math.min(BINS - 1, Math.floor(a.epistemicRigor * BINS)) !== bin) continue;
        const rad = 2.2 + Math.min(3, a.neighbors.length * 0.12) + (a.adoptionsThisTick ? 1.4 : 0);
        const x = sx(a.index);
        const y = sy(a.index);
        ctx.moveTo(x + rad, y);
        ctx.arc(x, y, rad, 0, Math.PI * 2);
        drew = true;
      }
      if (drew) ctx.fill();
    }

    for (const [idx, colour, rad] of [
      [hover.current, 'rgba(240,240,240,0.5)', 7],
      [selectedAgent, '#f3f3ef', 9],
    ] as [number | null, string, number][]) {
      if (idx == null || !agents[idx]) continue;
      ctx.strokeStyle = colour;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(sx(idx), sy(idx), rad, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.fillStyle = 'rgba(155,155,155,0.85)';
    ctx.font = '11px "IBM Plex Mono", monospace';
    ctx.fillText(
      `clustering ${engine.clustering.toFixed(2)} · mean trust ${engine.metrics().meanTrust.toFixed(2)}`,
      14,
      height - 14,
    );
  });

  const pick = (evt: React.MouseEvent<HTMLCanvasElement>): number | null => {
    const layout = layoutRef.current;
    const geom = hit.current;
    if (!layout || !geom) return null;
    const rect = evt.currentTarget.getBoundingClientRect();
    const mx = evt.clientX - rect.left;
    const my = evt.clientY - rect.top;
    let best: number | null = null;
    let bestDist = 144;
    for (let i = 0; i < layout.xs.length; i++) {
      const dx = geom.w / 2 + layout.xs[i] * geom.r - mx;
      const dy = geom.h / 2 + layout.ys[i] * geom.r - my;
      const d = dx * dx + dy * dy;
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    return best;
  };

  return (
    <canvas
      ref={canvasRef}
      className="h-full w-full cursor-crosshair"
      onMouseMove={(e) => {
        hover.current = pick(e);
      }}
      onMouseLeave={() => {
        hover.current = null;
      }}
      onClick={(e) => useSimStore.getState().selectAgent(pick(e))}
    />
  );
}

/** Deterministic annulus layout, rebuilt only when the graph itself changes. */
function ensureLayout(
  ref: React.MutableRefObject<Layout | null>,
  engine: ReturnType<typeof useSimStore.getState>['engine'],
): Layout {
  const n = engine.agents.length;
  let edgeCount = 0;
  for (const a of engine.agents) edgeCount += a.neighbors.length;
  const signature = `${n}:${edgeCount}:${engine.config.seed}:${engine.config.rewireProbability}`;
  if (ref.current && ref.current.signature === signature) return ref.current;

  const xs = new Float32Array(n);
  const ys = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const angle = (i / n) * Math.PI * 2;
    // Two interleaved rings keep dense neighbourhoods from collapsing into a line.
    const r = i % 2 === 0 ? 0.98 : 0.84;
    xs[i] = Math.cos(angle) * r;
    ys[i] = Math.sin(angle) * r;
  }

  const edges: number[] = [];
  for (let i = 0; i < n; i++) {
    for (const j of engine.agents[i].neighbors) {
      if (j > i) edges.push(i, j);
    }
  }

  const layout: Layout = { xs, ys, signature, edges: Int32Array.from(edges) };
  ref.current = layout;
  return layout;
}
