import { useEffect, useRef, useState } from 'react';
import { useSimStore } from '../store/useSimStore';
import { captureEndState, type EndState } from '../core/engine/snapshot';

interface Interpretation { model: string; method: string; interpretation: string; evidence: unknown }
export default function EndStatePanel() {
  const selected = useSimStore(s => s.selectedMeme);
  const tick = useSimStore(s => s.metrics.tick);
  const revision = useSimStore(s => s.revision);
  const [ticks, setTicks] = useState(100);
  const [snapshot, setSnapshot] = useState<EndState | null>(null);
  const [result, setResult] = useState<Interpretation | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [scheduled, setScheduled] = useState<{ target: number; id: string; run: number } | null>(null);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);

  const interpret = async (value: EndState) => {
    controller.current?.abort();
    const request = new AbortController(); controller.current = request;
    setBusy(true); setError(''); setResult(null);
    try {
      const response = await fetch(`${(import.meta as ImportMeta & { env: { BASE_URL: string } }).env.BASE_URL}api/interpret`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: request.signal,
        body: JSON.stringify({ vector: value.vector, rootId: value.rootId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Interpretation failed.');
      if (controller.current === request) setResult(data);
    } catch (e) {
      if (!request.signal.aborted) setError(e instanceof Error ? e.message : 'Cannot reach the interpretation backend.');
    } finally { if (controller.current === request) setBusy(false); }
  };
  const capture = (id: string, decode = false) => {
    controller.current?.abort(); setBusy(false); setError(''); setResult(null);
    try {
      const value = captureEndState(useSimStore.getState().engine, id);
      setSnapshot(value);
      if (decode) void interpret(value);
    } catch (e) { setError(e instanceof Error ? e.message : 'Capture failed.'); }
  };
  useEffect(() => {
    if (!scheduled) return;
    const state = useSimStore.getState();
    if (state.engine.runVersion !== scheduled.run) { setScheduled(null); setError('Scheduled capture cancelled because the run reset.'); return; }
    if (tick >= scheduled.target) { setScheduled(null); capture(scheduled.id, true); }
    else if (state.stopAtTick !== scheduled.target) { setScheduled(null); setError('Scheduled capture cancelled because the run settings changed.'); }
  // Capture reads the current engine only at the scheduled boundary.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, revision, scheduled]);
  const download = () => {
    if (!snapshot) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify({ ...snapshot, semanticInterpretation: result }, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = `${snapshot.memeId}-tick-${snapshot.tick}.json`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <div className="p-5 text-xs leading-relaxed">
    <p className="text-slate">Select a meme, then capture its deepest descendant (including extinct variants). Ties use the most recently created variant. A variant’s vector itself is immutable.</p>
    <p className="my-3 break-all font-mono">Selected: {selected ?? 'Choose a cosmos node or meme row'}</p>
    <div className="flex flex-wrap items-center gap-2">
      <button className="chip" disabled={!selected || !!scheduled} onClick={() => selected && capture(selected)}>Capture now</button>
      <label>Additional ticks <input aria-label="Additional ticks" type="number" min="1" max="10000" value={ticks} onChange={e => setTicks(Number(e.target.value))} className="ml-2 w-20 border border-hair bg-void p-2" /></label>
      <button className="chip" disabled={!selected || !!scheduled || !Number.isInteger(ticks) || ticks < 1 || ticks > 10000} onClick={() => {
        if (!selected) return;
        const state = useSimStore.getState();
        setScheduled({ target: state.engine.tick + ticks, id: selected, run: state.engine.runVersion });
        state.runForTicks(ticks);
      }}>Run & interpret</button>
    </div>
    {scheduled && <p className="mt-3" role="status">Scheduled for tick {scheduled.target}; current tick {tick}. The run pauses at that exact tick. <button className="underline" onClick={() => { setScheduled(null); useSimStore.setState({ stopAtTick: null }); }}>Cancel capture</button></p>}
    {snapshot && <div className="mt-5 border-t border-hair pt-4">
      <p className="break-all font-mono">{snapshot.memeId} · generation {snapshot.generation} · tick {snapshot.tick}</p>
      <p className="text-slate">Frozen snapshot · seed {snapshot.seed} · root drift {snapshot.driftDistance.toFixed(4)}</p>
      <div className="my-3 flex flex-wrap gap-2"><button className="chip" onClick={download}>Download embedding + report ↓</button><button className="chip" disabled={busy} onClick={() => void interpret(snapshot)}>{busy ? 'Interpreting…' : 'Interpret snapshot'}</button></div>
      <details><summary className="cursor-pointer">View all 256 coordinates</summary><pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-all font-mono text-[10px]">{JSON.stringify(snapshot.vector)}</pre></details>
      <p className="mt-4 text-slate">Nearest source tweets (cosine similarity, not confidence):</p>
      {snapshot.nearestTweets.slice(0, 3).map(n => <p key={n.id} className="mt-2"><span className="font-mono">{n.similarity.toFixed(3)}</span> · {n.text}</p>)}
    </div>}
    {error && <p className="mt-4 border border-hair p-3" role="alert">{error}</p>}
    {result && <div className="mt-4 border-t border-hair pt-4"><h3>Semantic interpretation · {result.model}</h3><p className="mt-2 whitespace-pre-wrap">{result.interpretation}</p></div>}
    <p className="mt-5 text-slate">Interpretation uses nearest tweets and trait changes as evidence for a Qwen-compatible text model. It is an approximate reading, not a recovered original sentence. Clicking Interpret sends that evidence to your configured model provider.</p>
  </div>;
}
