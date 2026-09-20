import { useRef, useState } from 'react';
import { useSimStore } from '../../store/useSimStore';
import { TRAITS } from '../../core/data/loadDataset';
import { useCanvas } from './useCanvas';
import { rampCss, TRAIT_COLORS } from '../palette';

export default function MemeCosmos() {
  const [zoom, setZoom] = useState(1);
  const points = useRef<{ id: string; x: number; y: number; radius: number }[]>([]);
  const canvas = useCanvas(({ ctx, width, height }) => {
    const { engine, selectedMeme, showTrails } = useSimStore.getState();
    ctx.fillStyle = '#080808'; ctx.fillRect(0, 0, width, height);
    // Calibrated once per run to real roots/anchors, never refitted as mutations arrive.
    const [extentX, extentY] = engine.cosmosExtent;
    const scale = Math.max(1, Math.min((width - 60) / (2 * extentX), (height - 80) / (2 * extentY))) * zoom;
    const project = (v: Float64Array) => {
      const [x, y] = engine.cosmosProjector.project(v);
      return [width / 2 + x * scale, height / 2 - y * scale];
    };
    // Fixed scale and basis: roots never move when variants appear or disappear.
    ctx.strokeStyle = '#242424'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, height / 2); ctx.lineTo(width, height / 2);
    ctx.moveTo(width / 2, 0); ctx.lineTo(width / 2, height); ctx.stroke();
    const visible = [...engine.memes.values()].filter(m => m.generation === 0 || (engine.holders.get(m.id)?.size ?? 0) > 0 || engine.tick - m.originTick < 100 || m.id === selectedMeme);
    // Selecting an archived variant restores its ancestral path on the canvas.
    const visibleIds = new Set(visible.map(m => m.id));
    const ancestry = selectedMeme ? [engine.getMeme(selectedMeme)] : [];
    while (ancestry.length) {
      const ancestor = ancestry.pop();
      if (!ancestor) continue;
      if (!visibleIds.has(ancestor.id)) { visible.push(ancestor); visibleIds.add(ancestor.id); }
      const parentIds = ancestor.parentIds?.length ? ancestor.parentIds : ancestor.parentId ? [ancestor.parentId] : [];
      for (const parentId of parentIds) {
        const parent = engine.getMeme(parentId);
        if (parent && !visibleIds.has(parent.id)) ancestry.push(parent);
      }
    }
    if (showTrails) for (const meme of visible) {
      const parents = (meme.parentIds?.length ? meme.parentIds : meme.parentId ? [meme.parentId] : [])
        .map(id => engine.getMeme(id)).filter((parent): parent is NonNullable<typeof parent> => Boolean(parent));
      for (const parent of parents) {
        const [x, y] = project(meme.vector), [px, py] = project(parent.vector);
        ctx.strokeStyle = rampCss(meme.rationality, meme.id === selectedMeme ? 0.95 : 0.3);
        ctx.beginPath(); ctx.moveTo(px, py); ctx.quadraticCurveTo((x + px) / 2 + (y - py) * 0.15, (y + py) / 2, x, y); ctx.stroke();
      }
    }
    points.current = [];
    for (const meme of visible) {
      const [x, y] = project(meme.vector), root = meme.generation === 0;
      const radius = meme.id === selectedMeme ? 6 : root ? 4 : 2;
      ctx.fillStyle = rampCss(meme.rationality);
      ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = root ? 9 : 0;
      ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
      if (meme.id === selectedMeme) { ctx.strokeStyle = '#fff'; ctx.stroke(); }
      points.current.push({ id: meme.id, x, y, radius });
    }
    if (engine.data) for (const trait of TRAITS) {
      const [x, y] = project(engine.data.anchors[trait]);
      ctx.strokeStyle = TRAIT_COLORS[trait]; ctx.strokeRect(x - 4, y - 4, 8, 8);
      ctx.fillStyle = TRAIT_COLORS[trait]; ctx.font = '11px sans-serif'; ctx.fillText(trait, x + 7, y - 5);
    }
    ctx.fillStyle = '#999999'; ctx.font = '11px sans-serif';
    ctx.fillText(`Fixed root PCA · ${((engine.cosmosProjector.explained[0] + engine.cosmosProjector.explained[1]) * 100).toFixed(1)}% variance · ${visible.length} nodes`, 16, height - 14);
  });
  return <div className="relative h-full w-full">
    <div className="absolute bottom-8 right-3 z-10 flex gap-1" aria-label="Cosmos zoom">
      <button className="chip bg-panel" aria-label="Zoom out" onClick={() => setZoom(z => Math.max(0.25, z / 1.5))}>−</button>
      <button className="chip bg-panel" aria-label="Reset zoom" onClick={() => setZoom(1)}>{zoom.toFixed(1)}×</button>
      <button className="chip bg-panel" aria-label="Zoom in" onClick={() => setZoom(z => Math.min(8, z * 1.5))}>+</button>
    </div>
    <canvas ref={canvas} className="h-full w-full cursor-crosshair" aria-label="Meme Cosmos: click a root or mutation to inspect its lineage" onClick={e => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    let best: string | null = null, distance = Infinity;
    for (const p of points.current) {
      const d = Math.hypot(p.x - x, p.y - y);
      if (d <= p.radius + 5 && d < distance) { best = p.id; distance = d; }
    }
    useSimStore.getState().selectMeme(best);
  }} /></div>;
}
