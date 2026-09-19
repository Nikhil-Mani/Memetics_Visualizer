import { useSimStore } from '../store/useSimStore';
import { num, pct, rampCss } from './palette';

export default function MemePanel() {
  const engine = useSimStore((s) => s.engine);
  const selected = useSimStore((s) => s.selectedMeme);
  useSimStore((s) => s.revision);

  const rows = engine.rankedMemes(12);
  const lineage = selected ? engine.lineage(selected) : [];

  return (
    <div className="grid h-full grid-cols-1 gap-px overflow-hidden bg-hair lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
      <div className="flex min-h-0 flex-col bg-panel">
        <header className="flex items-baseline justify-between border-b border-hair px-5 py-3">
          <h2 className="text-sm text-mist">Circulating memes</h2>
          <p className="text-xs text-slate">ranked by R₀ and reach</p>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <table className="w-full border-collapse text-xs">
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
                      <span className="text-mist">{meme.label}</span>
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
                    Nothing in circulation yet. Press play, or inject an idea from the left.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
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
                    style={{ paddingLeft: `${depth * 14}px` }}
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
                      {num(meme.irrationality)} · {meme.adoptionCount}
                    </span>
                  </button>
                ))}
                {lineage.length <= 1 && (
                  <p className="text-[11px] text-slate">No mutations yet — this is the original wording.</p>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
