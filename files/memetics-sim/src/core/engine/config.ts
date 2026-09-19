export interface SimConfig {
  seed: number;
  agentCount: number;
  meanDegree: number;
  rewireProbability: number;

  // Initial cognitive distribution
  initialRigor: number;
  initialRigorSpread: number;
  initialSusceptibility: number;
  initialBoundedConfidence: number;
  initialLearningRate: number;

  // Transmission
  broadcastRate: number; // per-agent probability of broadcasting on a tick
  fanout: number; // neighbours reached per broadcast
  mutationProbability: number;

  // Trust feedback
  trustLearningRate: number; // eta
  evaluationDelay: number; // ticks before a receipt is judged

  // Plasticity
  driftDelta: number; // delta_drift — epistemic fatigue / training per adoption
  conformityRate: number; // lambda — normative social contagion

  // Content supply
  injectionRate: number; // new memes per tick (expected)
  injectionIrrationality: number; // centre of the injected spectrum
  convictionDecay: number;
  inventoryCapacity: number;
}

export const DEFAULT_CONFIG: SimConfig = {
  seed: 20260918,
  agentCount: 320,
  meanDegree: 8,
  rewireProbability: 0.12,

  initialRigor: 0.55,
  initialRigorSpread: 0.16,
  initialSusceptibility: 0.45,
  initialBoundedConfidence: 0.55,
  initialLearningRate: 0.12,

  broadcastRate: 0.14,
  fanout: 2,
  mutationProbability: 0.08,

  trustLearningRate: 0.05,
  evaluationDelay: 12,

  driftDelta: 0.012,
  conformityRate: 0.004,

  injectionRate: 0.25,
  injectionIrrationality: 0.5,
  convictionDecay: 0.006,
  inventoryCapacity: 10,
};

export interface Preset {
  id: string;
  name: string;
  blurb: string;
  config: Partial<SimConfig>;
}

export const PRESETS: Preset[] = [
  {
    id: 'baseline',
    name: 'Mixed feed',
    blurb:
      'Balanced content supply, moderate rigor, mildly clustered network. The control condition.',
    config: {},
  },
  {
    id: 'renaissance',
    name: 'Epistemic renaissance',
    blurb:
      'High-rigor memes flood the feed and verification pays: rigorous agents reward careful senders, so trust concentrates on low-irrationality sources.',
    config: {
      initialRigor: 0.72,
      initialRigorSpread: 0.12,
      initialSusceptibility: 0.3,
      injectionIrrationality: 0.16,
      injectionRate: 0.9,
      trustLearningRate: 0.08,
      driftDelta: 0.016,
      rewireProbability: 0.3,
      initialBoundedConfidence: 0.62,
    },
  },
  {
    id: 'cascade',
    name: 'Conspiratorial cascade',
    blurb:
      'High-virality, high-irrationality injections meet a low-rigor population. Rigor holds for a while, then gives way all at once.',
    config: {
      initialRigor: 0.42,
      initialRigorSpread: 0.14,
      initialSusceptibility: 0.68,
      injectionIrrationality: 0.88,
      injectionRate: 1.1,
      broadcastRate: 0.2,
      mutationProbability: 0.14,
      driftDelta: 0.016,
      rewireProbability: 0.22,
    },
  },
  {
    id: 'balkanised',
    name: 'Echo chamber balkanisation',
    blurb:
      'Tight clustering and a narrow confidence window. Almost nothing crosses between communities, and each one drifts on its own trajectory.',
    config: {
      rewireProbability: 0.01,
      meanDegree: 10,
      initialBoundedConfidence: 0.22,
      conformityRate: 0.009,
      initialRigorSpread: 0.22,
      injectionIrrationality: 0.55,
      fanout: 3,
    },
  },
];

export function applyPreset(base: SimConfig, preset: Preset): SimConfig {
  return { ...base, ...preset.config };
}
