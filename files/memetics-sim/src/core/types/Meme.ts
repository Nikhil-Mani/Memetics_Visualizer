import type { Vec } from '../math/vector';
import type { Trait } from '../data/loadDataset';
export interface SelectionRecord {
  winner: number;
  fitness: number[];
  alignments: number[][];
  platformWeights: number[];
  agentWeights: number[];
  weights: number[];
  deltas: Record<Trait, number>;
}
export interface Meme {
  id: string;
  rootId: string;
  parentId: string | null;
  /** All immediate parents; parentId remains the primary lineage/display parent. */
  parentIds?: string[];
  text: string;
  vector: Vec;
  rationality: number;
  /** Compatibility alias: 0 rational, 1 irrational, identical to rationality. */
  irrationality: number;
  label: string;
  baseLabel: string;
  virality: number;
  cognitiveLoad: number;
  mutationVariance: number;
  generation: number;
  driftDistance: number;
  selection?: SelectionRecord;
  originTick: number;
  broadcastCount: number;
  penetrationHistory: number[];
  adoptionCount: number;
  exposureCount: number;
  firstAdopterId: string | null;
  peakPenetration: number;
  alive: boolean;
}
export function reproductionNumber(m: Meme, fanout: number): number {
  return m.exposureCount ? m.adoptionCount / m.exposureCount * fanout : 0;
}
