import { useSimStore } from '../store/useSimStore';
import { num, pct, rampCss } from './palette';

const VIEW_COPY = {
  cosmos: ['Meme Cosmos', 'Nodes are tweet embeddings. Large circles are source tweets; smaller circles are evolved variants. Lines show parent → child lineage.'],
  semantic: ['Agent space', 'Each dot is an agent worldview projected from 256D. Faint links are social ties. Position is semantic; color is epistemic rigor.'],
  trust: ['Trust network', 'Nodes are agents arranged for readability. Blue edges are reciprocal trust; colored pulses are meme transmissions and their outcomes.'],
} as const;

export default function InterpretationPanel() {
  const mode = useSimStore((s) => s.mode);
  const metrics = useSimStore((s) => s.metrics);
  const engine = useSimStore((s) => s.engine);
  const [title, description] = VIEW_COPY[mode];
  const climate = metrics.climateIndex;
  const rigor = metrics.rationalityIndex;
  const signal = rigor > 0.62 ? 'epistemic defenses are holding' : rigor < 0.38 ? 'the population is undergoing rigor erosion' : 'the population is in a mixed regime';

  return (
    <div className="grid gap-px bg-hair md:grid-cols-[1.25fr_1fr_1fr]" data-testid="interpretation-panel">
      <section className="bg-panel px-5 py-4">
        <p className="eyebrow">HOW TO READ THIS RUN</p>
        <h2 className="mt-2 text-base text-mist">{title}</h2>
        <p className="mt-2 text-xs leading-relaxed text-slate">{description}</p>
        <p className="mt-3 border-l-2 border-cyan pl-3 text-xs leading-relaxed text-mist">
          {signal}. Follow a meme’s lineage, then compare its trait alignment with the agents who adopted it.
        </p>
      </section>
      <section className="bg-panel px-5 py-4">
        <p className="eyebrow">LIVE STATE</p>
        <div className="mt-3 grid grid-cols-2 gap-x-5 gap-y-3 text-xs">
          <Value label="tick" value={String(metrics.tick)} color="#f3f3ef" />
          <Value label="agents" value={String(engine.agents.length)} color="#f3f3ef" />
          <Value label="mean rigor" value={num(rigor, 3)} color={rampCss(1 - rigor)} />
          <Value label="meme climate" value={pct(climate, 1)} color={rampCss(1 - climate)} />
          <Value label="mutated this run" value={pct(metrics.mutatedShare, 1)} color="#b69aff" />
          <Value label="mean trust" value={num(metrics.meanTrust, 3)} color="#68b7ff" />
        </div>
      </section>
      <section className="bg-panel px-5 py-4">
        <p className="eyebrow">INTERPRETATION RULES</p>
        <ul className="mt-3 space-y-2 text-xs leading-relaxed text-slate">
          <li><span className="text-mist">Cosine alignment</span> measures direction in embedding space, not truth.</li>
          <li><span className="text-mist">Rationality</span> is a modeled trait derived from rigor and outrage alignment.</li>
          <li><span className="text-mist">Adoption</span> combines affinity, trust, virality, attention, memory, and cognitive load.</li>
          <li><span className="text-mist">Extinct</span> means unheld now; the lineage can still explain how it evolved.</li>
        </ul>
      </section>
    </div>
  );
}

function Value({ label, value, color }: { label: string; value: string; color: string }) {
  return <div><span className="block text-slate">{label}</span><strong className="font-mono tabular-nums" style={{ color }}>{value}</strong></div>;
}
