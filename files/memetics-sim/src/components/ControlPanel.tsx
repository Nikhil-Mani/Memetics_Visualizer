import { useSimStore } from '../store/useSimStore';
import { PRESETS, type SimConfig } from '../core/engine/config';
import { num, rampCss } from './palette';

interface SliderSpec {
  key: keyof SimConfig;
  label: string;
  min: number;
  max: number;
  step: number;
  hint: string;
  digits?: number;
}

const TRANSMISSION: SliderSpec[] = [
  { key: 'broadcastRate', label: 'Broadcast rate', min: 0.02, max: 1, step: 0.02, hint: 'chance an agent shares something each tick' },
  { key: 'fanout', label: 'Fanout', min: 1, max: 8, step: 1, hint: 'neighbours reached per broadcast', digits: 0 },
  { key: 'mutationProbability', label: 'Mutation chance', min: 0, max: 0.6, step: 0.02, hint: 'a re-share rewrites the idea' },
];

const COGNITION: SliderSpec[] = [
  { key: 'driftDelta', label: 'Drift per adoption', min: 0, max: 0.08, step: 0.002, hint: 'δ_drift — how fast rigor trains or erodes', digits: 3 },
  { key: 'conformityRate', label: 'Conformity rate', min: 0, max: 0.02, step: 0.001, hint: 'λ — pull toward the neighbourhood mean', digits: 3 },
  { key: 'trustLearningRate', label: 'Trust learning rate', min: 0, max: 0.2, step: 0.005, hint: 'η — weight of each retrospective judgement', digits: 3 },
  { key: 'evaluationDelay', label: 'Evaluation delay', min: 2, max: 40, step: 1, hint: 'ticks before a share is judged by its reach', digits: 0 },
];

const SUPPLY: SliderSpec[] = [
  { key: 'injectionRate', label: 'New memes per tick', min: 0, max: 3, step: 0.1, hint: 'content entering from outside', digits: 1 },
  { key: 'injectionIrrationality', label: 'Feed irrationality', min: 0, max: 1, step: 0.02, hint: 'centre of the injected spectrum' },
  { key: 'convictionDecay', label: 'Forgetting rate', min: 0, max: 0.03, step: 0.001, hint: 'conviction lost per tick', digits: 3 },
];

const STRUCTURE: SliderSpec[] = [
  { key: 'agentCount', label: 'Agents', min: 60, max: 600, step: 20, hint: 'rebuilds the population', digits: 0 },
  { key: 'meanDegree', label: 'Mean degree', min: 2, max: 16, step: 1, hint: 'rebuilds the network', digits: 0 },
  { key: 'rewireProbability', label: 'Rewiring', min: 0, max: 1, step: 0.01, hint: '0 = tight lattice, 1 = random graph' },
];

export default function ControlPanel() {
  const { running, ticksPerFrame, presetId, config, mode, showTrails } = useSimStore((s) => ({
    running: s.running,
    ticksPerFrame: s.ticksPerFrame,
    presetId: s.presetId,
    config: s.config,
    mode: s.mode,
    showTrails: s.showTrails,
  }));
  const store = useSimStore.getState();

  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto px-5 py-5">
      <section>
        <h2 className="mb-3 text-sm text-mist">Scenario</h2>
        <div className="flex flex-col gap-2">
          {PRESETS.map((preset) => (
            <button
              key={preset.id}
              onClick={() => store.loadPreset(preset.id)}
              className={`rounded border px-3 py-2 text-left transition-colors ${
                presetId === preset.id
                  ? 'border-cyan/60 bg-cyan/10 text-mist'
                  : 'border-hair bg-transparent text-slate hover:border-slate/60 hover:text-mist'
              }`}
            >
              <span className="block text-sm">{preset.name}</span>
              <span className="mt-1 block text-xs leading-snug text-slate">{preset.blurb}</span>
            </button>
          ))}
          {presetId === 'custom' && (
            <p className="text-xs text-slate">Parameters edited by hand — presets will overwrite them.</p>
          )}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm text-mist">Run</h2>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => store.toggle()}
            className="rounded border border-cyan/60 bg-cyan/10 px-3 py-1.5 text-sm text-cyan hover:bg-cyan/20"
          >
            {running ? 'Pause' : 'Play'}
          </button>
          <button onClick={() => store.stepOnce()} className="chip">
            Step
          </button>
          <button onClick={() => store.restart()} className="chip">
            Restart
          </button>
          <button onClick={() => store.reseed()} className="chip">
            New seed
          </button>
        </div>

        <label className="mt-4 block text-xs text-slate">
          Speed <span className="font-mono text-mist">{ticksPerFrame}×</span>
          <input
            type="range"
            min={1}
            max={8}
            step={1}
            value={ticksPerFrame}
            onChange={(e) => store.setSpeed(Number(e.target.value))}
            className="mt-1 w-full"
          />
        </label>

        <div className="mt-3 flex gap-2">
          <button
            onClick={() => store.setMode('semantic')}
            className={mode === 'semantic' ? 'chip chip-on' : 'chip'}
          >
            Semantic space
          </button>
          <button
            onClick={() => store.setMode('trust')}
            className={mode === 'trust' ? 'chip chip-on' : 'chip'}
          >
            Trust graph
          </button>
        </div>
        {mode === 'semantic' && (
          <label className="mt-3 flex items-center gap-2 text-xs text-slate">
            <input type="checkbox" checked={showTrails} onChange={() => store.toggleTrails()} />
            Show migration trails
          </label>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm text-mist">Inject an idea</h2>
        <p className="mb-2 text-xs leading-snug text-slate">
          Drops a new meme into five random agents so you can watch it travel.
        </p>
        <div className="flex gap-2">
          {[0.05, 0.5, 0.95].map((irr) => (
            <button
              key={irr}
              onClick={() => store.injectMeme(irr)}
              className="flex-1 rounded border border-hair px-2 py-1.5 text-xs hover:border-slate/60"
              style={{ color: rampCss(irr) }}
            >
              {irr < 0.2 ? 'Checkable' : irr < 0.8 ? 'Contested' : 'Conspiratorial'}
            </button>
          ))}
        </div>
      </section>

      <Sliders title="Transmission" specs={TRANSMISSION} config={config} />
      <Sliders title="Cognition and trust" specs={COGNITION} config={config} />
      <Sliders title="Content supply" specs={SUPPLY} config={config} />
      <Sliders title="Population structure" specs={STRUCTURE} config={config} note="Changing these rebuilds the run." />
    </div>
  );
}

function Sliders({
  title,
  specs,
  config,
  note,
}: {
  title: string;
  specs: SliderSpec[];
  config: SimConfig;
  note?: string;
}) {
  return (
    <section>
      <h2 className="mb-1 text-sm text-mist">{title}</h2>
      {note && <p className="mb-2 text-xs text-slate">{note}</p>}
      <div className="flex flex-col gap-3">
        {specs.map((spec) => {
          const value = config[spec.key] as number;
          return (
            <label key={String(spec.key)} className="block">
              <span className="flex items-baseline justify-between text-xs text-slate">
                {spec.label}
                <span className="font-mono tabular-nums text-mist">
                  {num(value, spec.digits ?? 2)}
                </span>
              </span>
              <input
                type="range"
                min={spec.min}
                max={spec.max}
                step={spec.step}
                value={value}
                onChange={(e) =>
                  useSimStore.getState().setConfig({ [spec.key]: Number(e.target.value) } as Partial<SimConfig>)
                }
                className="mt-1 w-full"
              />
              <span className="text-[11px] leading-tight text-slate/70">{spec.hint}</span>
            </label>
          );
        })}
      </div>
    </section>
  );
}
