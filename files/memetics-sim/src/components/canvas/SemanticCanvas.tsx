import { useRef } from 'react';
import { useCanvas, type Frame } from './useCanvas';
import { useSimStore } from '../../store/useSimStore';
import { ramp } from '../palette';
import { TRAIL_CAPACITY } from '../../core/types/Agent';

const BINS = 22;
const BG = '#080808';

/**
 * Mode A — the ideological map. Agents are projected from the 256-D worldview
 * hypersphere into the first two principal components and coloured by epistemic
 * rigor. Trails are the last few projected positions, so a population drifting
 * into a new consensus leaves a visible current.
 */
export default function SemanticCanvas() {
  const view = useRef({ cx: 0, cy: 0, scale: 1, ready: false });
  const hover = useRef<number | null>(null);

  const canvasRef = useCanvas((frame: Frame) => {
    const { ctx, width, height } = frame;
    const { engine, showTrails, selectedAgent } = useSimStore.getState();
    const agents = engine.agents;

    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, width, height);
    if (agents.length === 0) return;

    // --- view fitting (eased so the camera does not jitter every recompute) ---
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const a of agents) {
      if (a.x < minX) minX = a.x;
      if (a.x > maxX) maxX = a.x;
      if (a.y < minY) minY = a.y;
      if (a.y > maxY) maxY = a.y;
    }
    const spanX = Math.max(maxX - minX, 0.2);
    const spanY = Math.max(maxY - minY, 0.2);
    const pad = 46;
    const targetScale = Math.min((width - pad * 2) / spanX, (height - pad * 2) / spanY);
    const targetCx = (minX + maxX) / 2;
    const targetCy = (minY + maxY) / 2;
    const v = view.current;
    if (!v.ready) {
      v.cx = targetCx;
      v.cy = targetCy;
      v.scale = targetScale;
      v.ready = true;
    } else {
      v.cx += (targetCx - v.cx) * 0.06;
      v.cy += (targetCy - v.cy) * 0.06;
      v.scale += (targetScale - v.scale) * 0.06;
    }
    const px = (x: number) => width / 2 + (x - v.cx) * v.scale;
    const py = (y: number) => height / 2 - (y - v.cy) * v.scale;

    drawGrid(ctx, width, height);

    // --- trails, batched into colour bins -----------------------------------
    if (showTrails) {
      for (let bin = 0; bin < BINS; bin++) {
        const t = bin / (BINS - 1);
        const [r, g, b] = ramp(1 - t);
        ctx.strokeStyle = `rgba(${r},${g},${b},0.16)`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        let drew = false;
        for (const a of agents) {
          if (Math.min(BINS - 1, Math.floor(a.epistemicRigor * BINS)) !== bin) continue;
          if (a.trailLength < 2) continue;
          for (let k = 0; k < a.trailLength; k++) {
            const idx = (a.trailHead - a.trailLength + k + TRAIL_CAPACITY * 2) % TRAIL_CAPACITY;
            const tx = px(a.trail[idx * 2]);
            const ty = py(a.trail[idx * 2 + 1]);
            if (k === 0) ctx.moveTo(tx, ty);
            else ctx.lineTo(tx, ty);
          }
          drew = true;
        }
        if (drew) ctx.stroke();
      }
    }

    // --- agents, one path per colour bin ------------------------------------
    for (let bin = 0; bin < BINS; bin++) {
      const t = bin / (BINS - 1);
      const [r, g, b] = ramp(1 - t);
      ctx.fillStyle = `rgba(${r},${g},${b},0.92)`;
      ctx.beginPath();
      let drew = false;
      for (const a of agents) {
        if (Math.min(BINS - 1, Math.floor(a.epistemicRigor * BINS)) !== bin) continue;
        const radius = 2.4 + Math.min(3.2, a.inventory.size * 0.28) + (a.adoptionsThisTick ? 1.6 : 0);
        const x = px(a.x);
        const y = py(a.y);
        ctx.moveTo(x + radius, y);
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        drew = true;
      }
      if (drew) ctx.fill();
    }

    // --- highlights ----------------------------------------------------------
    const markers: [number | null, string, number][] = [
      [hover.current, 'rgba(240,240,240,0.55)', 7],
      [selectedAgent, '#f3f3ef', 9],
    ];
    for (const [idx, colour, radius] of markers) {
      if (idx == null || !agents[idx]) continue;
      const a = agents[idx];
      ctx.strokeStyle = colour;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(px(a.x), py(a.y), radius, 0, Math.PI * 2);
      ctx.stroke();
    }

    const [e1, e2] = engine.projector.explained;
    ctx.fillStyle = 'rgba(155,155,155,0.85)';
    ctx.font = '11px "IBM Plex Mono", monospace';
    ctx.fillText(`PC1 ${(e1 * 100).toFixed(0)}% · PC2 ${(e2 * 100).toFixed(0)}% of worldview variance`, 14, height - 14);

    // Store the transform for hit testing.
    hitTransform.current = { px, py };
  });

  const hitTransform = useRef<{ px: (x: number) => number; py: (y: number) => number } | null>(null);

  const pick = (evt: React.MouseEvent<HTMLCanvasElement>): number | null => {
    const transform = hitTransform.current;
    if (!transform) return null;
    const rect = evt.currentTarget.getBoundingClientRect();
    const mx = evt.clientX - rect.left;
    const my = evt.clientY - rect.top;
    const agents = useSimStore.getState().engine.agents;
    let best: number | null = null;
    let bestDist = 144;
    for (const a of agents) {
      const dx = transform.px(a.x) - mx;
      const dy = transform.py(a.y) - my;
      const d = dx * dx + dy * dy;
      if (d < bestDist) {
        bestDist = d;
        best = a.index;
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

function drawGrid(ctx: CanvasRenderingContext2D, width: number, height: number) {
  ctx.strokeStyle = 'rgba(50,50,50,0.4)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x <= width; x += 64) {
    ctx.moveTo(Math.floor(x) + 0.5, 0);
    ctx.lineTo(Math.floor(x) + 0.5, height);
  }
  for (let y = 0; y <= height; y += 64) {
    ctx.moveTo(0, Math.floor(y) + 0.5);
    ctx.lineTo(width, Math.floor(y) + 0.5);
  }
  ctx.stroke();
}
