import Sparkline from './Sparkline';
import { useSimStore } from '../store/useSimStore';
import { describeBimodality } from '../core/math/stats';
import { num, pct, rampCss } from './palette';

export default function MetricsBar() {
  const metrics = useSimStore((s) => s.metrics);
  const engine = useSimStore((s) => s.engine);

  const rho = engine.rationalityHistory;
  const climate = engine.climateHistory;
  const bimodal = engine.bimodalityHistory;

  const rhoStart = rho.values.length ? rho.values[0] : metrics.rationalityIndex;
  const drift = metrics.rationalityIndex - rhoStart;

  return (
    <div className="bg-hair">
      <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 border-b border-hair bg-panel px-5 py-3" data-testid="mutation-summary">
        <span className="text-sm text-mist">Mutated this run <strong className="font-mono text-cyan" data-testid="mutated-share">{pct(metrics.mutatedShare, 1)}</strong></span>
        <span className="text-xs text-slate">{metrics.generatedMutations} variants / {metrics.totalMemesCreated} total unique memes created</span>
        <span className="text-xs text-slate">Currently circulating: {pct(metrics.liveMutatedShare, 1)} mutated ({metrics.liveMutations}/{metrics.liveMemes})</span>
        <span className="text-xs text-slate">Highest generation: <strong data-testid="max-generation">{metrics.maxGeneration}</strong></span>
        <span className="w-full text-[10px] text-slate">Run percentage includes all generated variants, even if rejected or retired; denominator includes the 200 original tweets. Resets with each new run.</span>
      </div>
      <div className="metrics-grid">
      <Panel
        title="Societal rationality"
        value={num(metrics.rationalityIndex, 3)}
        caption={
          drift >= 0
            ? `up ${num(drift, 3)} since the run began — defences training`
            : `down ${num(Math.abs(drift), 3)} since the run began — erosion`
        }
        accent={rampCss(1 - metrics.rationalityIndex)}
      >
        <Sparkline values={rho.values} color={rampCss(1 - metrics.rationalityIndex)} baseline={rhoStart} />
      </Panel>

      <Panel
        title="Meme climate"
        value={pct(metrics.climateIndex, 1)}
        caption={`of circulating belief mass is rational · ${metrics.liveMemes} memes alive`}
        accent={rampCss(1 - metrics.climateIndex)}
      >
        <Sparkline values={climate.values} color={rampCss(1 - metrics.climateIndex)} baseline={0.5} />
      </Panel>

      <Panel
        title="Polarisation"
        value={num(metrics.bimodality, 3)}
        caption={`${describeBimodality(metrics.bimodality)} · Sarle's coefficient, split above 0.555`}
        accent="#d0d0d0"
      >
        <Sparkline values={bimodal.values} color="#d0d0d0" min={0.1} max={1} baseline={5 / 9} />
      </Panel>

      <Panel
        title="Transmission"
        value={num(metrics.adoptionsPerTick, 1)}
        caption={`adoptions per tick · mean peer trust ${num(metrics.meanTrust)} · susceptibility ${num(metrics.susceptibility)}`}
        accent="#f3f3ef"
      >
        <div className="flex h-full items-end gap-[3px]">
          {engine.susceptibilityHistory.values.slice(-48).map((v, i) => (
            <span
              key={i}
              className="flex-1 rounded-sm"
              style={{ height: `${Math.max(6, v * 100)}%`, background: rampCss(v, 0.55) }}
            />
          ))}
        </div>
      </Panel>
      </div>
    </div>
  );
}

function Panel({
  title,
  value,
  caption,
  accent,
  children,
}: {
  title: string;
  value: string;
  caption: string;
  accent: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-panel px-5 py-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm text-slate">{title}</h2>
        <span className="font-mono text-xl tabular-nums" style={{ color: accent }}>
          {value}
        </span>
      </div>
      <div className="mt-2 h-10">{children}</div>
      <p className="mt-2 text-xs leading-snug text-slate">{caption}</p>
    </div>
  );
}
