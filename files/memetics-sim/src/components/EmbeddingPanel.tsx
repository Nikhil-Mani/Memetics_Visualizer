import { useMemo } from 'react';
import { TRAITS } from '../core/data/loadDataset';
import { dot, norm } from '../core/math/vector';
import type { Meme } from '../core/types/Meme';
import { useSimStore } from '../store/useSimStore';
import { num, rampCss, TRAIT_COLORS } from './palette';

const COORDINATE_PREVIEW = 64;

export default function EmbeddingPanel() {
  const engine = useSimStore(s => s.engine);
  const selected = useSimStore(s => s.selectedMeme);
  useSimStore(s => s.revision);

  const activeRows = useMemo(
    () => engine.rankedMemes(80, 'circulating').filter(row => row.meme.generation > 0),
    [engine, engine.tick],
  );
  const selectedMeme = selected ? engine.getMeme(selected) : undefined;
  const meme = selectedMeme ?? activeRows[0]?.meme ?? engine.rankedMemes(1, 'circulating')[0]?.meme;
  const holders = meme ? engine.holders.get(meme.id)?.size ?? 0 : 0;
  const root = meme ? engine.getMeme(meme.rootId) : undefined;
  const status = holders > 0 ? 'circulating' : 'extinct / unheld';
  const traitAlignment = meme && engine.data ? TRAITS.map(t => [t, dot(meme.vector, engine.data!.anchors[t])] as const) : [];
  const nearestRoots = meme
    ? [...engine.roots]
      .map(rootMeme => ({ meme: rootMeme, similarity: dot(meme.vector, rootMeme.vector) }))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 5)
    : [];

  return (
    <div className="flex h-full min-h-0 flex-col bg-panel text-xs">
      <div className="border-b border-hair px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-sm text-mist">Circulating vector</h2>
            {meme ? (
              <>
                <p className="mt-2 break-all font-mono text-[11px]" style={{ color: rampCss(meme.irrationality) }}>{meme.id}</p>
                <p className="mt-1 text-slate">Gen {meme.generation} · {status} · {holders} holders · root drift {num(meme.driftDistance, 3)}</p>
              </>
            ) : <p className="mt-2 text-slate">Waiting for circulating memes.</p>}
          </div>
          {meme && (
            <button className="chip" onClick={() => downloadVector(meme)}>
              Download vector ↗
            </button>
          )}
        </div>
        {meme && <p className="mt-3 line-clamp-2 leading-relaxed text-slate" title={meme.label}>{meme.label}</p>}
      </div>

      {!meme ? (
        <div className="px-5 py-4 text-slate">The simulation has not produced a visible embedding yet.</div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-px overflow-hidden bg-hair xl:grid-cols-[minmax(0,1.15fr)_minmax(280px,.85fr)]">
          <div className="min-h-0 overflow-y-auto bg-panel px-5 py-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-sm text-mist">Embedding coordinates</h3>
              <span className="font-mono text-[10px] text-slate">L2 {num(norm(meme.vector), 4)} / 256D</span>
            </div>
            <VectorBars meme={meme} />
            <details className="mt-4">
              <summary className="cursor-pointer font-mono text-[10px] text-slate hover:text-mist">View all 256 raw coordinates</summary>
              <pre className="mt-2 max-h-44 overflow-auto whitespace-pre-wrap break-all border border-hair bg-void p-3 font-mono text-[10px] leading-relaxed text-slate">
                {JSON.stringify(Array.from(meme.vector, value => Number(value.toFixed(6))))}
              </pre>
            </details>
          </div>

          <div className="min-h-0 overflow-y-auto bg-panel px-5 py-4">
            <h3 className="text-sm text-mist">Semantic position</h3>
            <div className="mt-3 space-y-3">
              {traitAlignment.map(([trait, value]) => (
                <div key={trait}>
                  <div className="mb-1 flex items-center justify-between font-mono text-[10px]" style={{ color: TRAIT_COLORS[trait] }}>
                    <span>{trait}</span><span>{value >= 0 ? '+' : ''}{num(value, 3)}</span>
                  </div>
                  <div className="relative h-2 bg-void">
                    <span className="absolute left-1/2 top-0 h-2 w-px bg-hair" />
                    <span
                      className="absolute top-0 h-2"
                      style={{
                        left: `${value < 0 ? 50 + value * 50 : 50}%`,
                        width: `${Math.abs(value) * 50}%`,
                        background: TRAIT_COLORS[trait],
                        opacity: 0.9,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>

            <h3 className="mt-5 text-sm text-mist">Nearest source tweets</h3>
            <div className="mt-2 space-y-2">
              {nearestRoots.map(({ meme: rootMeme, similarity }) => (
                <button
                  key={rootMeme.id}
                  onClick={() => useSimStore.getState().selectMeme(rootMeme.id)}
                  className="block w-full border border-hair bg-void px-3 py-2 text-left hover:border-mist"
                >
                  <span className="flex items-center justify-between gap-3 font-mono text-[10px]">
                    <span className="break-all" style={{ color: rampCss(rootMeme.irrationality) }}>{rootMeme.id}</span>
                    <span className="text-slate">{num(similarity, 3)}</span>
                  </span>
                  <span className="mt-1 line-clamp-2 text-slate">{rootMeme.text}</span>
                </button>
              ))}
            </div>

            {root && (
              <p className="mt-4 border-t border-hair pt-3 text-slate">
                Root: <span className="font-mono" style={{ color: rampCss(root.irrationality) }}>{root.id}</span> · generation {root.generation}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function VectorBars({ meme }: { meme: Meme }) {
  const maxAbs = Math.max(0.001, ...Array.from(meme.vector.slice(0, COORDINATE_PREVIEW), Math.abs));
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-2 md:grid-cols-4">
      {Array.from({ length: COORDINATE_PREVIEW }, (_, i) => {
        const value = meme.vector[i];
        const width = Math.max(2, Math.abs(value) / maxAbs * 50);
        const color = value >= 0 ? '#68b7ff' : '#ff5c99';
        return (
          <div key={i} className="min-w-0">
            <div className="flex items-center justify-between gap-2 font-mono text-[9px] text-slate">
              <span>d{i.toString().padStart(3, '0')}</span>
              <span>{value >= 0 ? '+' : ''}{value.toFixed(3)}</span>
            </div>
            <div className="relative mt-1 h-2 bg-void">
              <span className="absolute left-1/2 top-0 h-2 w-px bg-hair" />
              <span
                className="absolute top-0 h-2"
                style={{
                  left: value < 0 ? `${50 - width}%` : '50%',
                  width: `${width}%`,
                  background: color,
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function downloadVector(meme: Meme) {
  const payload = {
    id: meme.id,
    rootId: meme.rootId,
    parentId: meme.parentId,
    generation: meme.generation,
    driftDistance: meme.driftDistance,
    vector: Array.from(meme.vector),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${meme.id.replace(/[^a-z0-9_-]/gi, '_')}-embedding.json`;
  link.click();
  URL.revokeObjectURL(url);
}
