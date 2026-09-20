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
      const variance = clamp(
        parent.mutationVariance * (0.65 + 0.8 * parent.virality) * (1.25 - agent.epistemicRigor * 0.5),
        0.0005,
        0.2,
      );
      const alpha = TRAITS.map(() => rng.normal(0, Math.sqrt(variance)));
      // mutationVariance is the intended total isotropic mutation energy. If
      // we use sqrt(variance) independently in all 256 coordinates, the
      // aggregate noise norm grows by sqrt(256) and erases the parent vector.
      // Divide by dimension so candidates remain local semantic mutations.
      const coordinateSd = Math.sqrt(variance / v.length);
      for (let d = 0; d < v.length; d++) {
        for (let k = 0; k < TRAITS.length; k++) v[d] -= alpha[k] * this.anchors[TRAITS[k]][d];
        v[d] += rng.normal(0, coordinateSd);
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

  /** Recombine two circulating memes before applying local mutation noise. */
  recombine(a: Meme, b: Meme, root: Meme, agent: Agent, config: SimConfig, tick: number, rng: Rng): Meme {
    const mix = 0.35 + rng.next() * 0.3;
    const blended = new Float64Array(a.vector.length);
    for (let d = 0; d < blended.length; d++) blended[d] = mix * a.vector[d] + (1 - mix) * b.vector[d];
    const synthetic = { ...a, vector: normalize(blended), mutationVariance: (a.mutationVariance + b.mutationVariance) / 2,
      virality: (a.virality + b.virality) / 2, cognitiveLoad: (a.cognitiveLoad + b.cognitiveLoad) / 2 };
    const child = this.mutate(synthetic, root, agent, config, tick, rng);
    child.parentId = a.id;
    child.generation = Math.max(a.generation, b.generation) + 1;
    return child;
  }
}
