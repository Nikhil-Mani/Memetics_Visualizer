import type { Meme } from './Meme';
import type { Vec } from '../math/vector';

export interface MemeReceipt {
  memeId: string;
  senderId: string;
  tickReceived: number;
  accepted: boolean;
  /** Penetration at the moment of receipt — the baseline for the virality index. */
  penetrationAtReceipt: number;
}

export interface InventoryEntry {
  meme: Meme;
  conviction: number; // [0, 1] — decays with time, refreshed by re-exposure
  acquiredTick: number;
}

export interface TrustEvent {
  peerId: string;
  delta: number;
  reason: string;
  tick: number;
}

export interface CognitiveLogEntry {
  tick: number;
  text: string;
  kind: 'adopt' | 'reject' | 'gate' | 'trust' | 'drift';
  irrationality: number;
}

export interface PlasticitySample {
  tick: number;
  rigor: number;
  susceptibility: number;
  confidence: number;
}

export interface Agent {
  id: string;
  index: number;
  worldview: Vec; // unit norm

  // Plastic hyperparameters
  epistemicRigor: number; // rho  [0, 1]
  emotionalSusceptibility: number; // eps  [0, 1]
  boundedConfidence: number; // tau  [0.05, 0.90]
  learningRate: number; // alpha [0.01, 0.40]

  // Relational memory
  peerTrust: Map<string, number>; // T_{j->i}, default 0.5
  pendingMemeReceipts: MemeReceipt[];
  trustEvents: TrustEvent[];

  inventory: Map<string, InventoryEntry>;
  cognitiveLog: CognitiveLogEntry[];
  plasticityHistory: PlasticitySample[];

  neighbors: number[];

  // Render state
  x: number;
  y: number;
  trail: Float32Array; // ring buffer of projected positions
  trailHead: number;
  trailLength: number;
  adoptionsThisTick: number;
}

export const TRAIL_CAPACITY = 24;
export const LOG_CAPACITY = 60;
export const PLASTICITY_CAPACITY = 240;

export function trustIn(agent: Agent, peerId: string): number {
  return agent.peerTrust.get(peerId) ?? 0.5;
}

export function pushLog(agent: Agent, entry: CognitiveLogEntry): void {
  agent.cognitiveLog.push(entry);
  if (agent.cognitiveLog.length > LOG_CAPACITY) agent.cognitiveLog.shift();
}

export function pushTrustEvent(agent: Agent, event: TrustEvent): void {
  agent.trustEvents.push(event);
  if (agent.trustEvents.length > 120) agent.trustEvents.shift();
}

export function pushTrail(agent: Agent, x: number, y: number): void {
  agent.trail[agent.trailHead * 2] = x;
  agent.trail[agent.trailHead * 2 + 1] = y;
  agent.trailHead = (agent.trailHead + 1) % TRAIL_CAPACITY;
  if (agent.trailLength < TRAIL_CAPACITY) agent.trailLength++;
}

export function dominantMeme(agent: Agent): InventoryEntry | null {
  let best: InventoryEntry | null = null;
  for (const entry of agent.inventory.values()) {
    if (!best || entry.conviction > best.conviction) best = entry;
  }
  return best;
}

/** Mean irrationality of everything the agent currently holds, conviction-weighted. */
export function mediaDiet(agent: Agent): number {
  let num = 0;
  let den = 0;
  for (const e of agent.inventory.values()) {
    num += e.meme.irrationality * e.conviction;
    den += e.conviction;
  }
  return den > 0 ? num / den : 0.5;
}
