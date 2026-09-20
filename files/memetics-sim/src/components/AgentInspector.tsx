import { useSimStore } from '../store/useSimStore';
import Sparkline from './Sparkline';
import { num, pct, rampCss, rigorCss } from './palette';
import { dot } from '../core/math/vector';
import { TRAIT_COLORS } from './palette';
import { TRAITS } from '../core/data/loadDataset';

export default function AgentInspector() {
  const index = useSimStore((s) => s.selectedAgent);
  const engine = useSimStore((s) => s.engine);
  useSimStore((s) => s.revision); // re-read the mutable agent each published frame

  if (index == null || !engine.agents[index]) {
    return (
      <div className="flex flex-col justify-center gap-2 px-6 py-8 text-sm text-slate">
        <p className="text-mist">No agent selected.</p>
        <p className="leading-relaxed">
          Click any point on the canvas to open its mind: how its rigor and susceptibility have
          drifted, who it has learned to trust, and the reasoning behind every meme it accepted or
          turned down.
        </p>
      </div>
    );
  }

  const agent = engine.agents[index];
  const history = agent.plasticityHistory;
  const { trusted, distrusted } = engine.trustTable(agent);
  const diet = engine.agentDiet(agent);
  const rigorSeries = history.map((h) => h.rigor);
  const susSeries = history.map((h) => h.susceptibility);
  const confSeries = history.map((h) => h.confidence);

  return (
    <div className="flex flex-col">
      <header className="sticky top-0 z-10 flex items-baseline justify-between gap-3 border-b border-hair bg-panel px-5 py-3">
        <div>
          <h2 className="text-base text-mist">Agent #{agent.index}</h2>
          <p className="text-xs text-slate">
            {agent.neighbors.length} neighbours · {agent.inventory.size} memes held · diet
            irrationality {num(diet)}
          </p>
        </div>
        <button onClick={() => useSimStore.getState().selectAgent(null)} className="chip">
          Close
        </button>
      </header>

      <section className="border-b border-hair px-5 py-4">
        <h3 className="mb-3 text-sm text-mist">Plasticity</h3>
        <div className="flex flex-col gap-3">
          <Drift label="Epistemic rigor ρ" value={agent.epistemicRigor} series={rigorSeries} color={rigorCss(agent.epistemicRigor)} />
          <Drift
            label="Emotional susceptibility ε"
            value={agent.emotionalSusceptibility}
            series={susSeries}
            color={rampCss(agent.emotionalSusceptibility)}
          />
          <Drift label="Bounded confidence τ" value={agent.boundedConfidence} series={confSeries} color="#b69aff" />
        </div>
        <p className="mt-3 text-xs text-slate">
          Learning rate α {num(agent.learningRate)} — worldview shift per accepted meme.
        </p>
        <div className="mt-3 grid grid-cols-3 gap-2 text-[10px] text-slate">
          <span>attention <b className="font-mono text-mist">{num(agent.attention)}</b></span>
          <span>novelty <b className="font-mono text-mist">{num(agent.noveltySeeking)}</b></span>
          <span>confirmation <b className="font-mono text-mist">{num(agent.confirmationBias)}</b></span>
        </div>
      </section>

      <section className="border-b border-hair px-5 py-4">
        <h3 className="mb-3 text-sm text-mist">Worldview</h3>
        <div className="flex flex-col gap-1.5">
          {TRAITS.map((axis) => {
            const anchor = useSimStore.getState().engine.data?.anchors[axis];
            const v = anchor ? dot(agent.worldview, anchor) : 0;
            return (
              <div key={axis} className="flex items-center gap-3 text-xs">
                <span className="w-20 shrink-0 text-slate">{axis}</span>
                <span className="relative h-1.5 flex-1 rounded-full bg-hair">
                  <span
                    className="absolute top-0 h-1.5 rounded-full"
                    style={{
                      left: v >= 0 ? '50%' : `${50 + v * 50}%`,
                      width: `${Math.abs(v) * 50}%`,
                      background: TRAIT_COLORS[axis],
                      opacity: v >= 0 ? 1 : 0.6,
                    }}
                  />
                </span>
                <span className="w-12 shrink-0 text-right font-mono tabular-nums text-mist">
                  {v >= 0 ? '+' : ''}
                  {num(v)}
                </span>
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-[11px] leading-snug text-slate/80">
          Calibrated cosine alignment with the four externally encoded trait poles (−1 to +1).
        </p>
      </section>

      <section className="border-b border-hair px-5 py-4">
        <h3 className="mb-3 text-sm text-mist">Trust network</h3>
        <TrustTable title="Most trusted" rows={trusted} />
        <TrustTable title="Least trusted" rows={distrusted} />
        {trusted.length === 0 && (
          <p className="text-xs text-slate">
            No completed evaluations yet — trust updates once received memes have had{' '}
            {engine.config.evaluationDelay} ticks to prove themselves.
          </p>
        )}
      </section>

      <section className="px-5 py-4">
        <h3 className="mb-3 text-sm text-mist">Deliberation console</h3>
        <div className="flex flex-col gap-2">
          {[...agent.cognitiveLog].reverse().map((entry, i) => (
            <p
              key={`${entry.tick}-${i}`}
              className="border-l-2 pl-3 font-mono text-[11px] leading-relaxed text-slate"
              style={{
                borderColor: rampCss(entry.irrationality, entry.kind === 'adopt' ? 0.9 : 0.35),
                color: entry.kind === 'adopt' ? '#3ee0d0' : entry.kind === 'reject' || entry.kind === 'gate' ? '#ff9abf' : undefined,
              }}
            >
              {entry.text}
            </p>
          ))}
          {agent.cognitiveLog.length === 0 && (
            <p className="text-xs text-slate">Nothing has reached this agent yet.</p>
          )}
        </div>
      </section>
    </div>
  );
}

function Drift({
  label,
  value,
  series,
  color,
}: {
  label: string;
  value: number;
  series: number[];
  color: string;
}) {
  const delta = series.length > 1 ? value - series[0] : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-slate">{label}</span>
        <span className="font-mono tabular-nums" style={{ color }}>
          {num(value, 3)}
          <span className="ml-2 text-slate">
            {delta >= 0 ? '+' : ''}
            {num(delta, 3)}
          </span>
        </span>
      </div>
      <div className="mt-1 h-8">
        <Sparkline values={series.length > 1 ? series : [value, value]} color={color} />
      </div>
    </div>
  );
}

function TrustTable({
  title,
  rows,
}: {
  title: string;
  rows: { peerIndex: number; trust: number; net: number; events: number; reason: string }[];
}) {
  if (rows.length === 0) return null;
  return (
    <div className="mb-4">
      <p className="mb-1.5 text-xs text-slate">{title}</p>
      <div className="flex flex-col gap-1.5">
        {rows.map((row) => (
          <button
            key={row.peerIndex}
            onClick={() => useSimStore.getState().selectAgent(row.peerIndex)}
            className="rounded border border-hair px-2.5 py-1.5 text-left hover:border-slate/60"
          >
            <span className="flex items-baseline justify-between gap-2 text-xs">
              <span className="text-mist">Agent #{row.peerIndex}</span>
              <span className="font-mono tabular-nums" style={{ color: rampCss(1 - row.trust) }}>
                {num(row.trust)}
              </span>
            </span>
            <span className="mt-0.5 block text-[11px] leading-snug text-slate">
              {row.net >= 0 ? 'Trust rose ' : 'Trust fell '}
              {num(Math.abs(row.net), 3)} across {row.events} judgement
              {row.events === 1 ? '' : 's'}: {row.reason}.
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

export { pct };
