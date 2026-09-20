import { TRAITS, type Dataset, type Trait, type TraitAnchors } from '../data/loadDataset';
import { clamp, dot, normalize } from '../math/vector';
import type { Rng } from '../math/random';
import type { Agent } from '../types/Agent';
import type { Meme } from '../types/Meme';
import type { SimConfig } from './config';

const bookkeeping = () => ({ broadcastCount: 0, penetrationHistory: [], adoptionCount: 0, exposureCount: 0, firstAdopterId: null, peakPenetration: 0, alive: true });
export function createRoots(data: Dataset): Meme[] {
  return data.tweets.map((t, i) => ({ ...t, ...bookkeeping(), id: `root_${t.id}`, rootId: `root_${t.id}`, parentId: null,
    label: t.text, baseLabel: t.text, irrationality: t.rationality, vector: new Float64Array(data.vectors[i]), generation: 0, driftDistance: 0, originTick: 0 }));
}
export class EvolutionEngine {
  private serial = 0;
  constructor(readonly anchors: TraitAnchors) {}
  mutate(parent: Meme, root: Meme, agent: Agent, config: SimConfig, tick: number, rng: Rng): Meme {
    const rho = agent.epistemicRigor, eps = agent.emotionalSusceptibility;
    const platform = [config.platformRigor, config.platformOutrage, config.platformAbsurdity, config.platformSimplicity];
    const biases = [rho, eps, (1 - rho) * eps, 1 - rho];
    const weights = platform.map((p, i) => config.platformSelection * p + (1 - config.platformSelection) * biases[i]);
    const candidates = Array.from({ length: 5 }, () => {
      const v = new Float64Array(parent.vector);
      const alpha = TRAITS.map(() => rng.normal(0, Math.sqrt(parent.mutationVariance)));
      for (let d = 0; d < v.length; d++) {
        for (let k = 0; k < TRAITS.length; k++) v[d] -= alpha[k] * this.anchors[TRAITS[k]][d];
        v[d] += rng.normal(0, Math.sqrt(parent.mutationVariance));
      }
      return normalize(v);
    });
    const alignments = candidates.map(v => TRAITS.map(k => dot(v, this.anchors[k])));
    const fitness = alignments.map(a => a.reduce((sum, x, k) => sum + x * weights[k], 0));
    // Argmax selection is deterministic conditional on the five stochastic proposals.
    const winner = fitness.reduce((best, value, i) => value > fitness[best] ? i : best, 0);
    const vector = candidates[winner], a = alignments[winner];
    const rationality = clamp(0.5 - 0.5 * a[0] + 0.5 * a[1], 0, 1);
    return { ...parent, ...bookkeeping(), id: `${root.id}_mut_${++this.serial}`, parentId: parent.id,
      vector, rationality, irrationality: rationality, generation: parent.generation + 1, originTick: tick,
      virality: clamp(0.3 + 0.4 * a[1] + 0.3 * a[3], 0, 1),
      cognitiveLoad: clamp(0.5 + 0.3 * a[0] - 0.3 * a[3], 0, 1),
      driftDistance: clamp(1 - dot(vector, root.vector), 0, 2),
      selection: { winner, fitness, alignments, platformWeights: platform.map(p => p * config.platformSelection),
        agentWeights: biases.map(b => b * (1 - config.platformSelection)), weights,
        deltas: Object.fromEntries(TRAITS.map((k, i) => [k, a[i] - dot(parent.vector, this.anchors[k])])) as Record<Trait, number> },
    };
  }
}
