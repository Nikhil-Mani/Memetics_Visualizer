import { useSimStore } from '../store/useSimStore';
import { TRAITS } from '../core/data/loadDataset';
import { dot } from '../core/math/vector';
import { rampCss, TRAIT_COLORS } from './palette';

export default function DriftAnalytics() {
  const engine = useSimStore(s => s.engine);
  const selected = useSimStore(s => s.selectedMeme);
  useSimStore(s => s.revision);
  const meme = selected ? engine.getMeme(selected) : undefined;
  const root = meme && engine.getMeme(meme.rootId);
  // One point per active root family: mean virality versus mean root drift / depth.
  const families = new Map<string, { n: number; velocity: number; virality: number; irrationality: number }>();
  for (const m of engine.memes.values()) if (m.generation > 0 && (engine.holders.get(m.id)?.size ?? 0) > 0) {
    const f = families.get(m.rootId) ?? { n: 0, velocity: 0, virality: 0, irrationality: engine.memes.get(m.rootId)!.rationality };
    f.n++; f.velocity += m.driftDistance / m.generation; f.virality += m.virality; families.set(m.rootId, f);
  }
  const max = Math.max(0.1, ...[...families.values()].map(f => f.velocity / f.n));
  const alignment = meme && engine.data ? TRAITS.map(t => dot(meme.vector, engine.data!.anchors[t])) : [];
  const radar = (values: number[]) => values.map((v, i) => {
    const angle = -Math.PI / 2 + i * Math.PI / 2, r = (v + 1) / 2 * 60;
    return `${110 + Math.cos(angle) * r},${90 + Math.sin(angle) * r}`;
  }).join(' ');
  const selection = meme?.selection;
  const strongest = selection ? TRAITS.reduce((best, t, i) => selection.weights[i] * selection.deltas[t] > selection.weights[TRAITS.indexOf(best)] * selection.deltas[best] ? t : best, TRAITS[0]) : null;
  return <div className="border-b border-hair px-5 py-4 text-xs">
    <h2 className="text-sm text-mist">Drift velocity</h2>
    <svg viewBox="0 0 290 170" className="w-full" role="img" aria-label="Mean virality versus mean root cosine distance per generation, grouped by root">
      <path d="M35 10V135H280" fill="none" stroke="#555555" />
      <text x="35" y="155" fill="#999999" fontSize="10">0</text><text x="272" y="155" fill="#999999" fontSize="10">1</text>
      <text x="120" y="166" fill="#999999" fontSize="10">Mean virality</text>
      <text x="4" y="15" fill="#999999" fontSize="9">{max.toFixed(2)}</text>
      {[...families].map(([id, f]) => <circle key={id} cx={35 + f.virality / f.n * 245} cy={135 - f.velocity / f.n / max * 115} r="4" fill={rampCss(f.irrationality)} tabIndex={0} role="button" aria-label={`Inspect ${id}`} onClick={() => useSimStore.getState().selectMeme(id)} onKeyDown={e => { if (e.key === 'Enter') useSimStore.getState().selectMeme(id); }}><title>{id}: drift/gen {(f.velocity / f.n).toFixed(3)}</title></circle>)}
    </svg>
    <p className="text-slate">Y: mean root cosine distance ÷ generation. One point per active root family.</p>
    {!families.size && <p className="mt-2 text-slate">Waiting for adopted mutations.</p>}
    <h2 className="mt-5 text-sm text-mist">Lineage inspector</h2>
    {!meme ? <p className="mt-2 text-slate">Click a cosmos node or circulating meme.</p> : <>
      <p className="mt-3 break-all font-mono text-cyan">{meme.id}</p>
      <p className="mt-1 text-slate">{(engine.holders.get(meme.id)?.size ?? 0) > 0 ? 'Currently circulating' : 'Extinct / unheld'} · {meme.adoptionCount} lifetime adoptions</p>
      <p className="mt-3 text-slate">Original tweet · {meme.rootId}</p>
      <p className="mt-1 leading-relaxed">{root?.text}</p>
      <p className="mt-3" style={{ color: TRAIT_COLORS.absurdity }}>Generation {meme.generation} · root drift {meme.driftDistance.toFixed(3)}</p>
      <p className="mt-2 text-slate">Current text: {meme.text}</p>
      <p className="mt-2 text-slate">Text is retained from the source; semantic mutations do not generate new prose.</p>
      <svg viewBox="0 0 220 185" className="mx-auto w-full max-w-[280px]" role="img" aria-label="Trait alignment radar: center minus one, middle zero, edge plus one">
        {[0, 0.5, 1].map(v => <polygon key={v} points={radar([v * 2 - 1, v * 2 - 1, v * 2 - 1, v * 2 - 1])} fill="none" stroke="#555555" />)}
        <polygon points={radar(alignment)} fill="#68b7ff22" stroke="#68b7ff" />
        {TRAITS.map((t, i) => <text key={t} x={[110, 183, 110, 36][i]} y={[15, 94, 174, 94][i]} textAnchor="middle" fill={TRAIT_COLORS[t]} fontSize="9">{t}</text>)}
      </svg>
      <div className="grid grid-cols-2 gap-2 text-slate">{TRAITS.map((t, i) => <span key={t} style={{ color: TRAIT_COLORS[t] }}>{t}: {alignment[i]?.toFixed(3)}</span>)}</div>
      {selection && strongest && <>
        <p className="mt-4 leading-relaxed">Candidate #{selection.winner + 1} won with the highest fitness ({selection.fitness[selection.winner].toFixed(3)}) among five proposals. Largest weighted alignment change: {strongest} ({selection.deltas[strongest] >= 0 ? '+' : ''}{selection.deltas[strongest].toFixed(3)}).</p>
        <div className="mt-2 text-slate">{selection.fitness.map((f, i) => <span key={i} className="mr-3">#{i + 1}: {f.toFixed(3)}</span>)}</div>
        <table className="mt-3 w-full text-left text-[10px]"><thead><tr><th>Fitness contribution</th><th>Platform</th><th>Agent</th></tr></thead><tbody>{TRAITS.map((t, i) => <tr key={t}><td>{t}</td><td>{(selection.platformWeights[i] * alignment[i]).toFixed(3)}</td><td>{(selection.agentWeights[i] * alignment[i]).toFixed(3)}</td></tr>)}</tbody></table>
      </>}
    </>}
  </div>;
}
