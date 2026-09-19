import { clamp, mutateVector, type Vec } from '../math/vector';
import type { Rng } from '../math/random';

/**
 * A meme is a point on a continuous rational–irrational spectrum, not a binary
 * label. `irrationality` 0.0 is a falsifiable empirical proposition; 1.0 is an
 * unfalsifiable affective grievance.
 */
export interface Meme {
  id: string;
  label: string;
  /** The claim without any sensational or hedging prefix, so mutation doesn't stack wording. */
  baseLabel: string;
  irrationality: number; // [0, 1]
  vector: Vec; // unit norm, length D
  virality: number; // [0, 1] intrinsic salience
  cognitiveLoad: number; // [0, 1] parsing friction
  mutationVariance: number; // [0, 0.2]
  generation: number;
  originTick: number;
  broadcastCount: number;
  penetrationHistory: number[]; // share of population holding it, per sampled tick

  // Lineage / bookkeeping used by the phylogeny view and the R0 table.
  parentId: string | null;
  rootId: string;
  adoptionCount: number;
  exposureCount: number;
  firstAdopterId: string | null;
  peakPenetration: number;
  alive: boolean;
}

let memeCounter = 0;

export function resetMemeCounter(): void {
  memeCounter = 0;
}

export interface MemeSeed {
  label: string;
  irrationality: number;
  vector: Vec;
  virality?: number;
  cognitiveLoad?: number;
  mutationVariance?: number;
}

/**
 * Virality rises with irrationality and cognitive load falls with it — the
 * asymmetry that makes the rational side of the spectrum structurally
 * disadvantaged in transmission.
 */
export function createMeme(seed: MemeSeed, tick: number, rng: Rng): Meme {
  const irr = clamp(seed.irrationality, 0, 1);
  const id = `m${++memeCounter}`;
  return {
    id,
    label: seed.label,
    baseLabel: seed.label,
    irrationality: irr,
    vector: seed.vector,
    virality: clamp(seed.virality ?? 0.12 + 0.65 * irr + rng.normal(0, 0.06), 0, 1),
    cognitiveLoad: clamp(seed.cognitiveLoad ?? 0.3 + 0.45 * (1 - irr) + rng.normal(0, 0.06), 0, 1),
    mutationVariance: clamp(seed.mutationVariance ?? 0.04 + 0.1 * irr, 0, 0.2),
    generation: 0,
    originTick: tick,
    broadcastCount: 0,
    penetrationHistory: [],
    parentId: null,
    rootId: id,
    adoptionCount: 0,
    exposureCount: 0,
    firstAdopterId: null,
    peakPenetration: 0,
    alive: true,
  };
}

const SENSATIONAL_PREFIX = [
  'They knew about',
  'The truth about',
  'Nobody will say it:',
  'Leaked:',
  'Wake up about',
];
const SOBER_PREFIX = [
  'Revised estimate:',
  'Replication of',
  'Bounded claim:',
  'Measured effect:',
  'Caveat on',
];

/**
 * Mutation on re-broadcast:
 *   M'.vector        = normalize(M.vector + N(0, sigma^2 I))
 *   M'.irrationality = clamp(M.irrationality + N(0, 0.05), 0, 1)
 *
 * The label drifts with it, so the phylogeny tree reads as an idea being
 * sharpened into a slogan or hedged back into a claim.
 */
export function mutateMeme(parent: Meme, tick: number, rng: Rng): Meme {
  const irr = clamp(parent.irrationality + rng.normal(0, 0.05), 0, 1);
  const drift = irr - parent.irrationality;
  const id = `m${++memeCounter}`;

  // Rewording always rebuilds from the bare claim, so a long lineage reads as
  // one idea restated, not as a pile of stacked prefixes.
  let label = parent.label;
  if (Math.abs(drift) > 0.03) {
    const prefix = drift > 0 ? rng.pick(SENSATIONAL_PREFIX) : rng.pick(SOBER_PREFIX);
    const base = parent.baseLabel;
    label = `${prefix} ${base.charAt(0).toLowerCase()}${base.slice(1)}`;
  }

  return {
    id,
    label,
    baseLabel: parent.baseLabel,
    irrationality: irr,
    vector: mutateVector(parent.vector, parent.mutationVariance, rng),
    virality: clamp(parent.virality + 0.65 * drift + rng.normal(0, 0.03), 0, 1),
    cognitiveLoad: clamp(parent.cognitiveLoad - 0.45 * drift + rng.normal(0, 0.03), 0, 1),
    mutationVariance: clamp(parent.mutationVariance + rng.normal(0, 0.01), 0, 0.2),
    generation: parent.generation + 1,
    originTick: tick,
    broadcastCount: 0,
    penetrationHistory: [],
    parentId: parent.id,
    rootId: parent.rootId,
    adoptionCount: 0,
    exposureCount: 0,
    firstAdopterId: null,
    peakPenetration: 0,
    alive: true,
  };
}

/** Basic reproduction number: adoptions produced per exposure attempt, scaled by fanout. */
export function reproductionNumber(m: Meme, fanout: number): number {
  if (m.exposureCount === 0) return 0;
  return (m.adoptionCount / m.exposureCount) * fanout;
}
