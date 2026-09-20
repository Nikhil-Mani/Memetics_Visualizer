import { useEffect, useRef, useState } from 'react';
import { useSimStore } from '../store/useSimStore';
import { num, pct, rampCss } from './palette';

export default function MemePanel() {
  const engine = useSimStore((s) => s.engine);
  const selected = useSimStore((s) => s.selectedMeme);
  useSimStore((s) => s.revision);

  const [view, setView] = useState<'mutations' | 'circulating' | 'roots' | 'extinct'>('mutations');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const allRows = engine.rankedMemes(Infinity, view, query);
  const pageCount = Math.max(1, Math.ceil(allRows.length / 30));
  const currentPage = Math.min(page, pageCount - 1);
  const rows = allRows.slice(currentPage * 30, (currentPage + 1) * 30);
  const tableScroll = useRef<HTMLDivElement>(null);
  useEffect(() => { if (tableScroll.current) tableScroll.current.scrollTop = 0; }, [view, query, currentPage]);
  const lineage = selected ? engine.lineage(selected) : [];

  return (
    <div className="grid h-full min-w-0 grid-cols-1 grid-rows-[minmax(400px,1.5fr)_minmax(240px,1fr)] gap-px overflow-hidden bg-hair 2xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] 2xl:grid-rows-1">
      <div className="flex min-h-0 flex-col bg-panel">
        <header className="shrink-0 border-b border-hair px-4 py-3">
          <h2 className="text-sm text-mist">Meme activity</h2>
          <div className="mt-2 flex flex-wrap gap-2" aria-label="Meme activity filters">
            {(['mutations', 'circulating', 'roots', 'extinct'] as const).map(tab => <button key={tab} aria-pressed={view === tab} onClick={() => { setView(tab); setPage(0); }} className={view === tab ? 'chip chip-on' : 'chip'}>
              {tab === 'mutations' ? 'Latest mutations' : tab === 'circulating' ? 'Circulating' : tab === 'extinct' ? 'Extinct / unheld' : 'Original tweets'}
            </button>)}
          </div>
          <p className="mt-2 text-[11px] text-slate">{view === 'extinct' ? 'Unheld memes, including never-adopted and archived variants. Search or page through the entire run.' : view === 'mutations' ? 'Newest variants first, including those with no current holders.' : view === 'roots' ? 'Original tweets remain generation 0. Ranked by R₀ and reach.' : 'Currently held memes, ranked by R₀ and reach.'}</p>
          <input aria-label="Search memes" value={query} onChange={e => { setQuery(e.target.value); setPage(0); }} placeholder="Search tweet text, variant ID, or root ID" className="mt-2 w-full rounded border border-hair bg-void px-2 py-1 text-xs text-mist" />
        </header>
        <div ref={tableScroll} className="min-h-0 flex-1 overflow-auto">
          <table className="w-full border-collapse text-xs" aria-label="Meme activity">
            <thead className="sticky top-0 bg-panel text-slate">
              <tr className="border-b border-hair">
                <th className="px-5 py-2 text-left font-normal">Meme</th>
                <th className="px-2 py-2 text-right font-normal">Irr.</th>
                <th className="px-2 py-2 text-right font-normal">R₀</th>
                <th className="px-2 py-2 text-right font-normal">Reach</th>
                <th className="px-5 py-2 text-right font-normal">Gen.</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ meme, r0, penetration }) => (
                <tr
                  key={meme.id}
                  data-meme-id={meme.id}
                  data-generation={meme.generation}
                  tabIndex={0}
                  onKeyDown={e => { if (e.key === 'Enter') useSimStore.getState().selectMeme(meme.id); }}
                  onClick={() => useSimStore.getState().selectMeme(meme.id)}
                  className={`cursor-pointer border-b border-hair/60 transition-colors hover:bg-white/[0.03] ${
                    selected === meme.id ? 'bg-white/[0.05]' : ''
                  }`}
                >
                  <td className="px-5 py-2">
                    <span className="flex items-center gap-2">
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ background: rampCss(meme.irrationality) }}
                      />
                      <span className="min-w-0 text-mist">
                        <span className="block max-w-sm truncate font-mono text-[10px] text-cyan">{meme.id}</span>
                        <span className="line-clamp-2" title={meme.text}>{meme.label}</span>
                        <span className="mt-1 block text-[10px] text-slate">tick {meme.originTick} · {engine.holders.get(meme.id)?.size ?? 0} holders</span>
                      </span>
                    </span>
                  </td>
                  <td className="px-2 py-2 text-right font-mono tabular-nums" style={{ color: rampCss(meme.irrationality) }}>
                    {num(meme.irrationality)}
                  </td>
                  <td className="px-2 py-2 text-right font-mono tabular-nums text-mist">{num(r0)}</td>
                  <td className="px-2 py-2 text-right font-mono tabular-nums text-slate">{pct(penetration, 1)}</td>
                  <td className="px-5 py-2 text-right font-mono tabular-nums text-slate">{meme.generation}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-6 text-slate">
                    {query ? 'No matching memes in this view.' : view === 'mutations' ? 'No mutations generated yet. Run the simulation with a nonzero mutation chance.' : 'No memes in this view.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex shrink-0 items-center justify-between border-t border-hair px-4 py-2 text-[11px] text-slate">
          <button disabled={currentPage === 0} className="disabled:opacity-30" onClick={() => setPage(currentPage - 1)}>Previous</button>
          <span>{allRows.length} memes · page {currentPage + 1}/{pageCount}</span>
          <button disabled={currentPage + 1 >= pageCount} className="disabled:opacity-30" onClick={() => setPage(currentPage + 1)}>Next</button>
        </div>
      </div>

      <div className="flex min-h-0 flex-col bg-panel">
        <header className="border-b border-hair px-5 py-3">
          <h2 className="text-sm text-mist">Why it spread</h2>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {!selected ? (
            <p className="text-xs leading-relaxed text-slate">
              Pick a meme to see the account of its spread — which cluster carried it, what the
              acceptance function did with its virality and parsing cost, and how much sender trust
              it generated — along with the mutations it threw off.
            </p>
          ) : (
            <>
              <p className="text-xs leading-relaxed text-mist">{engine.explainMeme(selected)}</p>
              <h3 className="mb-2 mt-5 text-sm text-mist">Lineage</h3>
              <div className="flex flex-col gap-1">
                {lineage.map(({ meme, depth }) => (
                  <button
                    key={meme.id}
                    onClick={() => useSimStore.getState().selectMeme(meme.id)}
                    className="flex items-center gap-2 text-left text-[11px] hover:text-mist"
                    style={{ paddingLeft: `${Math.min(depth, 12) * 14}px` }}
                  >
                    <span className="text-slate/50">{depth === 0 ? '●' : '└'}</span>
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ background: rampCss(meme.irrationality) }}
                    />
                    <span className={meme.id === selected ? 'text-mist' : 'text-slate'}>
                      {meme.label}
                    </span>
                    <span className="font-mono tabular-nums text-slate/60">
                      Gen {meme.generation} · {(engine.holders.get(meme.id)?.size ?? 0) > 0 ? 'live' : 'extinct / unheld'} · {meme.adoptionCount} adoptions{(meme.parentIds?.length ?? 0) > 1 ? ' · hybrid' : ''}
                    </span>
                  </button>
                ))}
                {lineage.length <= 1 && (
                  <p className="text-[11px] text-slate">This family has no descendants yet.</p>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
