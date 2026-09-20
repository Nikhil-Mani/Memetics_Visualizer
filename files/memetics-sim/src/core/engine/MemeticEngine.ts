import { Rng } from '../math/random';
import { PcaProjector } from '../math/pca';
import { bimodalityCoefficient, History, mean, stddev } from '../math/stats';
import {
  clamp,
  dot,
  jitterUnit,
  lerpNormalized,
  sigmoid,
  type Vec,
} from '../math/vector';
import {
  reproductionNumber,
  type Meme,
} from '../types/Meme';
import {
  mediaDiet,
  pushLog,
  pushTrail,
  pushTrustEvent,
  trustIn,
  TRAIL_CAPACITY,
  PLASTICITY_CAPACITY,
  type Agent,
} from '../types/Agent';
import { buildSmallWorld, clusteringCoefficient } from './Network';
import type { Dataset } from '../data/loadDataset';
import { createRoots, EvolutionEngine } from './EvolutionEngine';
import { DEFAULT_CONFIG, type SimConfig } from './config';

export interface BroadcastPulse {
  from: number;
  to: number;
  irrationality: number;
  accepted: boolean;
  born: number; // tick it was created, for fading
}

export interface Metrics {
  tick: number;
  rationalityIndex: number; // mean rho
  rigorSpread: number;
  susceptibility: number; // mean eps
  climateIndex: number; // share of circulating conviction that is rational
  bimodality: number;
  meanTrust: number;
  adoptionsPerTick: number;
  liveMemes: number;
  generatedMutations: number;
  totalMemesCreated: number;
  mutatedShare: number;
  liveMutations: number;
  liveMutatedShare: number;
  maxGeneration: number;
  clustering: number;
}

const PCA_INTERVAL = 6;
const PENETRATION_SAMPLE = 5;

export class MemeticEngine {
  data: Dataset | null = null;
  evolution: EvolutionEngine | null = null;
  roots: Meme[] = [];
  cosmosProjector = new PcaProjector();
  cosmosExtent: [number, number] = [1, 1];
  config: SimConfig;
  rng: Rng;
  tick = 0;
  runVersion = 0;

  agents: Agent[] = [];
  memes = new Map<string, Meme>();
  archivedMemes = new Map<string, Meme>();
  holders = new Map<string, Set<number>>();
  pulses: BroadcastPulse[] = [];

  projector = new PcaProjector();
  clustering = 0;
  networkVersion = 0;

  rationalityHistory = new History();
  climateHistory = new History();
  bimodalityHistory = new History();
  susceptibilityHistory = new History();

  private generatedMutations = 0;
  private maxGeneration = 0;
  private adoptionsThisTick = 0;
  private adoptionsEma = 0;
  private rhoScratch: Float64Array = new Float64Array(0);
  private epsScratch: Float64Array = new Float64Array(0);
  private rhoView: Float64Array = new Float64Array(0);
  private pc1View: Float64Array = new Float64Array(0);

  constructor(config: SimConfig = DEFAULT_CONFIG) {
    this.config = { ...config };
    this.rng = new Rng(config.seed);
  }

  initialize(data: Dataset): void {
    this.data = data;
    this.reset();
  }

  // ---------------------------------------------------------------- lifecycle

  reset(config: SimConfig = this.config): void {
    this.config = { ...config };
    if (!this.data) return;
    this.evolution = new EvolutionEngine(this.data.anchors);
    this.roots = createRoots(this.data);
    this.cosmosProjector = new PcaProjector();
    this.cosmosProjector.fit(this.roots.map(m => m.vector));
    const calibration = [...this.roots.map(m => m.vector), ...Object.values(this.data.anchors), new Float64Array(256)];
    const projected = calibration.map(v => this.cosmosProjector.project(v));
    this.cosmosExtent = [
      Math.max(0.15, ...projected.map(([x]) => Math.abs(x))) + 0.15,
      Math.max(0.15, ...projected.map(([, y]) => Math.abs(y))) + 0.15,
    ];
    this.rng = new Rng(config.seed);
    this.tick = 0;
    this.runVersion++;
    this.memes.clear();
    this.archivedMemes.clear();
    this.holders.clear();
    this.pulses = [];
    this.adoptionsEma = 0;
    this.generatedMutations = 0;
    this.maxGeneration = 0;
    this.referencePenetration = 0.02;
    this.rationalityHistory = new History();
    this.climateHistory = new History();
    this.bimodalityHistory = new History();
    this.susceptibilityHistory = new History();
    this.projector = new PcaProjector();
    this.networkVersion = 0;

    const n = config.agentCount;
    const adjacency = buildSmallWorld(n, config.meanDegree, config.rewireProbability, this.rng);
    this.clustering = clusteringCoefficient(adjacency);

    // Community anchors: agents near each other on the ring start ideologically
    // close, which is what lets low rewiring produce genuine echo chambers.
    const communityCount = Math.max(3, Math.round(n / 60));
    // Pick separated source tweets for the initial communities. Random roots
    // can be near-duplicates in embedding space, which makes every community
    // start on top of the others before the simulation even begins.
    const anchors: Vec[] = [];
    const first = this.roots[this.rng.int(this.roots.length)].vector;
    anchors.push(first);
    while (anchors.length < communityCount) {
      let best: Vec | null = null;
      let bestDistance = -Infinity;
      for (const candidate of this.roots) {
        const distance = Math.min(...anchors.map(anchor => 1 - dot(anchor, candidate.vector)));
        if (distance > bestDistance) {
          bestDistance = distance;
          best = candidate.vector;
        }
      }
      if (!best) break;
      anchors.push(best);
    }

    this.agents = [];
    for (let i = 0; i < n; i++) {
      const anchor = anchors[Math.floor((i / n) * communityCount) % communityCount];
      const agent: Agent = {
        id: `a${i}`,
        index: i,
        worldview: jitterUnit(anchor, 0.7 / Math.sqrt(anchor.length), this.rng),
        epistemicRigor: clamp(
          this.rng.normal(config.initialRigor, config.initialRigorSpread),
          0.05,
          0.95,
        ),
        emotionalSusceptibility: clamp(
          this.rng.normal(config.initialSusceptibility, 0.15),
          0.02,
          0.98,
        ),
        boundedConfidence: clamp(
          this.rng.normal(config.initialBoundedConfidence, 0.1),
          0.05,
          0.9,
        ),
        learningRate: clamp(this.rng.normal(config.initialLearningRate, 0.04), 0.01, 0.4),
        attention: clamp(this.rng.normal(config.initialAttention, 0.12), 0.2, 1),
        noveltySeeking: clamp(this.rng.normal(config.initialNoveltySeeking, 0.15), 0.02, 0.98),
        confirmationBias: clamp(this.rng.normal(config.initialConfirmationBias, 0.14), 0.02, 0.98),
        peerTrust: new Map(),
        pendingMemeReceipts: [],
        trustEvents: [],
        inventory: new Map(),
        memeMemory: new Map(),
        cognitiveLog: [],
        plasticityHistory: [],
        neighbors: adjacency[i],
        x: 0,
        y: 0,
        trail: new Float32Array(TRAIL_CAPACITY * 2),
        trailHead: 0,
        trailLength: 0,
        adoptionsThisTick: 0,
      };
      this.agents.push(agent);
    }

    this.rhoScratch = new Float64Array(n);
    this.epsScratch = new Float64Array(n);
    this.rhoView = new Float64Array(n);
    this.pc1View = new Float64Array(n);

    // Original embeddings never bend toward a synthetic worldview. Seed each
    // tweet into its most semantically compatible community instead.
    for (const meme of this.roots) {
      this.registerMeme(meme);
      const carriers = [...this.agents].sort((a, b) => dot(b.worldview, meme.vector) - dot(a.worldview, meme.vector));
      for (const carrier of carriers.slice(0, 2)) this.grantMeme(carrier, meme, 0.7);
    }

    this.recomputeProjection(true);
    this.recordMetrics();
  }

  // ------------------------------------------------------------------- memes

  private registerMeme(meme: Meme): void {
    if (!this.memes.has(meme.id) && meme.generation > 0) {
      this.generatedMutations++;
      this.maxGeneration = Math.max(this.maxGeneration, meme.generation);
    }
    this.memes.set(meme.id, meme);
    this.holders.set(meme.id, new Set());
  }

  private grantMeme(agent: Agent, meme: Meme, conviction: number): void {
    const existing = agent.inventory.get(meme.id);
    if (existing) {
      existing.conviction = clamp(existing.conviction + 0.25, 0, 1);
      return;
    }
    agent.inventory.set(meme.id, { meme, conviction, acquiredTick: this.tick });
    this.holders.get(meme.id)?.add(agent.index);
    meme.adoptionCount++;
    if (!meme.firstAdopterId) meme.firstAdopterId = agent.id;
    this.enforceCapacity(agent);
  }

  private dropMeme(agent: Agent, memeId: string): void {
    agent.inventory.delete(memeId);
    this.holders.get(memeId)?.delete(agent.index);
  }

  private enforceCapacity(agent: Agent): void {
    const cap = this.config.inventoryCapacity;
    while (agent.inventory.size > cap) {
      let weakestId: string | null = null;
      let weakest = Infinity;
      for (const [id, entry] of agent.inventory) {
        if (entry.conviction < weakest) {
          weakest = entry.conviction;
          weakestId = id;
        }
      }
      if (!weakestId) break;
      this.dropMeme(agent, weakestId);
    }
  }

  penetration(memeId: string): number {
    const held = this.holders.get(memeId)?.size ?? 0;
    return held / this.agents.length;
  }

  // -------------------------------------------------------------------- tick

  step(): void {
    if (!this.data) return;
    this.tick++;
    this.adoptionsThisTick = 0;
    for (const a of this.agents) a.adoptionsThisTick = 0;

    this.injectContent();
    this.broadcastPhase();
    this.retrospectiveTrustPhase();
    this.rewirePhase();
    this.socialContagionPhase();
    this.decayPhase();

    if (this.tick % PENETRATION_SAMPLE === 0) {
      this.samplePenetration();
      this.updateReferencePenetration();
    }
    if (this.tick % PCA_INTERVAL === 0) this.recomputeProjection();
    if (this.tick % 8 === 0) this.recordPlasticity();

    this.adoptionsEma = 0.85 * this.adoptionsEma + 0.15 * this.adoptionsThisTick;
    this.recordMetrics();
    this.agePulses();
  }

  /** Reintroduce actual dataset roots, preserving their vectors and identities. */
  private spawnMeme(targetIrrationality: number, carrierCount: number, conviction: number): Meme {
    if (!this.roots.length) throw new Error('Dataset is not loaded');
    const pool = this.roots.filter(m => Math.abs(m.rationality - targetIrrationality) < 0.2);
    const meme = this.rng.pick(pool.length ? pool : this.roots);
    const origin = this.agents[this.rng.int(this.agents.length)];
    this.grantMeme(origin, meme, conviction);
    meme.alive = true;
    for (let c = 1; c < carrierCount; c++) {
      const target = origin.neighbors.length ? this.agents[this.rng.pick(origin.neighbors)] : origin;
      this.grantMeme(target, meme, conviction);
    }
    return meme;
  }

  /** New content enters the ecosystem each tick. */
  private injectContent(): void {
    let budget = this.config.injectionRate;
    while (budget > 0) {
      if (budget < 1 && this.rng.next() > budget) break;
      this.spawnMeme(this.config.injectionIrrationality, 1 + this.rng.int(2), 0.55);
      budget -= 1;
    }
  }

  /** Inject a specific meme at the user's request (control panel). */
  injectMeme(irrationality: number, carriers = 5): Meme {
    return this.spawnMeme(irrationality, carriers, 0.75);
  }

  private broadcastPhase(): void {
    const { broadcastRate, fanout, mutationProbability } = this.config;
    for (const sender of this.agents) {
      if (sender.inventory.size === 0) continue;
      if (this.rng.next() > broadcastRate) continue;

      const entry = this.selectBroadcast(sender);
      if (!entry) continue;

      // Mutation on re-broadcast.
      let payload = entry.meme;
      if (this.rng.next() < mutationProbability) {
        const partners = [...sender.inventory.values()].filter(candidate => candidate.meme.id !== entry.meme.id);
        if (partners.length > 0 && this.rng.next() < 0.22) {
          const partner = this.rng.pick(partners).meme;
          payload = this.evolution!.recombine(
            entry.meme,
            partner,
            this.memes.get(entry.meme.rootId) ?? this.roots[0],
            sender,
            this.config,
            this.tick,
            this.rng,
          );
        } else {
          payload = this.evolution!.mutate(entry.meme, this.memes.get(entry.meme.rootId)!, sender, this.config, this.tick, this.rng);
        }
        this.registerMeme(payload);
      }
      payload.broadcastCount++;

      const neighbors = sender.neighbors;
      if (neighbors.length === 0) continue;
      const reach = Math.min(fanout, neighbors.length);
      for (let k = 0; k < reach; k++) {
        const receiver = this.agents[neighbors[this.rng.int(neighbors.length)]];
        if (receiver.index === sender.index) continue;
        this.transmit(sender, receiver, payload);
      }
    }
  }

  /** Salience-weighted choice of what to share: conviction x virality. */
  private selectBroadcast(agent: Agent) {
    let total = 0;
    for (const e of agent.inventory.values()) {
      total += e.conviction * (0.25 + e.meme.virality);
    }
    if (total <= 0) return null;
    let r = this.rng.next() * total;
    for (const e of agent.inventory.values()) {
      r -= e.conviction * (0.25 + e.meme.virality);
      if (r <= 0) return e;
    }
    return null;
  }

  /**
   * Transmission and acceptance.
   *
   *   Affinity = cos(w_i, M)
   *   gate:      Affinity < (1 - tau_i)  -> reject outright
   *   z = 2.0*Affinity + 2.5*(T_ji - 0.5) + 3.0*(eps_i * virality)
   *       - 2.5*(rho_i * cognitiveLoad) - 1.5*(irrationality * rho_i)
   *   P_accept = sigmoid(z)
   */
  private transmit(sender: Agent, receiver: Agent, meme: Meme): void {
    meme.exposureCount++;

    const memory = receiver.memeMemory.get(meme.id) ?? { exposures: 0, lastSeen: this.tick, familiarity: 0, fatigue: 0 };
    const gap = Math.max(0, this.tick - memory.lastSeen);
    memory.exposures++;
    memory.lastSeen = this.tick;
    memory.familiarity = clamp(memory.familiarity * Math.exp(-gap / 24) + 0.18, 0, 1);
    memory.fatigue = clamp(memory.fatigue * Math.exp(-gap / 18) + (memory.exposures > 1 ? 0.08 : 0), 0, 1);
    receiver.memeMemory.set(meme.id, memory);

    const affinity = dot(receiver.worldview, meme.vector);
    const threshold = 1 - receiver.boundedConfidence;
    const trust = trustIn(receiver, sender.id);

    receiver.pendingMemeReceipts.push({
      memeId: meme.id,
      senderId: sender.id,
      tickReceived: this.tick,
      accepted: false,
      penetrationAtReceipt: this.penetration(meme.id),
    });
    const receipt = receiver.pendingMemeReceipts[receiver.pendingMemeReceipts.length - 1];

    if (affinity < threshold) {
      pushLog(receiver, {
        tick: this.tick,
        kind: 'gate',
        irrationality: meme.irrationality,
        text:
          `[Tick ${this.tick}] "${meme.label}" from Agent #${sender.index} rejected: outside bounded ` +
          `confidence envelope (affinity ${affinity.toFixed(2)} < threshold ${threshold.toFixed(2)}).`,
      });
      this.pushPulse(sender.index, receiver.index, meme.irrationality, false);
      return;
    }

    const z =
      2.0 * affinity +
      2.5 * (trust - 0.5) +
      3.0 * (receiver.emotionalSusceptibility * meme.virality) -
      2.5 * (receiver.epistemicRigor * meme.cognitiveLoad) -
      1.5 * (meme.irrationality * receiver.epistemicRigor);
    const novelty = memory.exposures === 1 ? receiver.noveltySeeking * 0.35 : -memory.fatigue;
    const confirmation = receiver.confirmationBias * Math.max(0, affinity) * 0.8;
    const attention = 0.65 + 0.7 * receiver.attention;
    const pAccept = sigmoid((z + novelty + confirmation) * attention);
    const accepted = this.rng.next() < pAccept;

    this.pushPulse(sender.index, receiver.index, meme.irrationality, accepted);

    if (!accepted) {
      pushLog(receiver, {
        tick: this.tick,
        kind: 'reject',
        irrationality: meme.irrationality,
        text:
          `[Tick ${this.tick}] "${meme.label}" (irr ${meme.irrationality.toFixed(2)}, vir ${meme.virality.toFixed(2)}) ` +
          `from Agent #${sender.index} (trust ${trust.toFixed(2)}). Epistemic resistance held ` +
          `(P=${pAccept.toFixed(2)}). Not adopted.`,
      });
      return;
    }

    receipt.accepted = true;

    // Worldview shift: w' = normalize((1 - alpha) w + alpha M)
    const before = receiver.worldview;
    // Bounded confidence also controls *how far* a compatible meme can move
    // an agent. A barely accepted meme should not erase the agent's worldview
    // in one update; a close match still receives the full learning rate.
    const confidenceSpan = Math.max(1e-6, receiver.boundedConfidence);
    const influence = receiver.learningRate * clamp(
      (affinity - threshold) / confidenceSpan,
      0.12,
      1,
    );
    receiver.worldview = lerpNormalized(before, meme.vector, influence);
    const shift = 1 - dot(before, receiver.worldview);

    this.grantMeme(receiver, meme, clamp(0.45 + 0.4 * pAccept, 0, 1));
    receiver.adoptionsThisTick++;
    this.adoptionsThisTick++;

    // Epistemic fatigue / habituation:
    //   rho' = clamp(rho + delta_drift * (0.5 - M.irrationality), 0.05, 0.95)
    const rigorBefore = receiver.epistemicRigor;
    receiver.epistemicRigor = clamp(
      receiver.epistemicRigor + this.config.driftDelta * (0.5 - meme.irrationality),
      0.05,
      0.95,
    );
    // Symmetric affective conditioning: sensational diets raise susceptibility.
    receiver.emotionalSusceptibility = clamp(
      receiver.emotionalSusceptibility +
        0.6 * this.config.driftDelta * (meme.irrationality - 0.5),
      0.02,
      0.98,
    );
    const rigorDelta = receiver.epistemicRigor - rigorBefore;

    const driver =
      3.0 * (receiver.emotionalSusceptibility * meme.virality) > 2.5 * (receiver.epistemicRigor * meme.cognitiveLoad)
        ? 'Trust in sender and emotional salience dominated'
        : 'Semantic alignment carried it past scrutiny';

    pushLog(receiver, {
      tick: this.tick,
      kind: 'adopt',
      irrationality: meme.irrationality,
      text:
        `[Tick ${this.tick}] "${meme.label}" (irr ${meme.irrationality.toFixed(2)}, vir ${meme.virality.toFixed(2)}) ` +
        `received from Agent #${sender.index} (trust ${trust.toFixed(2)}). ` +
        `${driver} (P=${pAccept.toFixed(2)}). Adopted. Worldview shifted ${shift.toFixed(3)}. ` +
        `Rigor ${rigorDelta >= 0 ? 'trained' : 'degraded'} by ${rigorDelta.toFixed(3)}.`,
    });
  }

  /** Trust-driven rewiring: weak ties decay, compatible trusted ties attract. */
  private rewirePhase(): void {
    if (this.tick % 24 !== 0) return;
    for (const agent of this.agents) {
      if (agent.neighbors.length < 2) continue;
      const weakest = agent.neighbors
        .map(peer => ({ peer, trust: trustIn(agent, this.agents[peer].id) }))
        .sort((a, b) => a.trust - b.trust)[0];
      if (!weakest || weakest.trust > 0.28 || this.rng.next() > 0.35) continue;
      const candidates = this.agents
        .filter(other => other.index !== agent.index && !agent.neighbors.includes(other.index))
        .map(other => ({ other, score: trustIn(agent, other.id) + 0.5 * dot(agent.worldview, other.worldview) }))
        .sort((a, b) => b.score - a.score);
      const replacement = candidates[0]?.other;
      if (!replacement) continue;
      agent.neighbors = agent.neighbors.filter(peer => peer !== weakest.peer);
      agent.neighbors.push(replacement.index);
      const reverse = this.agents[weakest.peer].neighbors;
      this.agents[weakest.peer].neighbors = reverse.filter(peer => peer !== agent.index);
      if (!replacement.neighbors.includes(agent.index)) replacement.neighbors.push(agent.index);
    }
    this.clustering = clusteringCoefficient(this.agents.map(a => a.neighbors));
    this.networkVersion++;
  }

  /**
   * Retrospective peer-trust update.
   *
   * A receipt recorded at t - evaluationDelay is now judged against how the
   * meme actually performed. The two motives in the brief are blended by the
   * agent's own weighting rather than switched on a threshold: an agent that is
   * both susceptible and rigorous feels both pulls at once.
   *
   *   prestige rule:  dT = eta * (V_M - 0.5)
   *   rigorous rule:  dT = eta * [(1 - irr) - irr * V_M]
   */
  private retrospectiveTrustPhase(): void {
    const { evaluationDelay, trustLearningRate: eta } = this.config;
    for (const agent of this.agents) {
      const pending = agent.pendingMemeReceipts;
      if (pending.length === 0) continue;
      let cut = 0;
      for (let i = 0; i < pending.length; i++) {
        const r = pending[i];
        if (this.tick - r.tickReceived < evaluationDelay) break;
        cut = i + 1;

        const meme = this.memes.get(r.memeId);
        if (!meme) continue;

        const viralityIndex = this.viralityIndex(meme, r.penetrationAtReceipt);

        const wPrestige =
          agent.emotionalSusceptibility /
          (agent.emotionalSusceptibility + agent.epistemicRigor + 1e-6);
        const wRigor = 1 - wPrestige;

        const prestige = viralityIndex - 0.5;
        const rigorous = 1 - meme.irrationality - meme.irrationality * viralityIndex;
        const delta = eta * (wPrestige * prestige + wRigor * rigorous);

        const before = trustIn(agent, r.senderId);
        const after = clamp(before + delta, 0.05, 0.95);
        agent.peerTrust.set(r.senderId, after);

        if (Math.abs(after - before) > 0.004) {
          const why =
            wPrestige > wRigor
              ? viralityIndex > 0.5
                ? `their share reached ${(this.penetration(meme.id) * 100).toFixed(0)}% of the network`
                : `their share went nowhere (${(this.penetration(meme.id) * 100).toFixed(0)}% reach)`
              : meme.irrationality > 0.5
                ? `they passed on low-rigor content (irr ${meme.irrationality.toFixed(2)})`
                : `they passed on a checkable claim (irr ${meme.irrationality.toFixed(2)})`;
          pushTrustEvent(agent, {
            peerId: r.senderId,
            delta: after - before,
            reason: why,
            tick: this.tick,
          });
        }
      }
      if (cut > 0) pending.splice(0, cut);
      if (pending.length > 240) pending.splice(0, pending.length - 240);
    }
  }

  /**
   * Subsequent virality index V_M in [0, 1]: current network penetration plus
   * transmission velocity since the receipt was filed.
   *
   * Both halves are scored against what memes in *this* ecosystem actually
   * achieve (an upper-quantile reference penetration, refreshed as the run
   * goes), not against a fixed constant. With a fixed threshold, a crowded
   * feed makes every share look like a dud and prestige-driven agents end up
   * punishing everyone indiscriminately. Here a typical meme scores ~0.5, so
   * trust only moves when a share genuinely over- or under-performs.
   */
  private viralityIndex(meme: Meme, penetrationAtReceipt: number): number {
    const now = this.penetration(meme.id);
    const ref = this.referencePenetration;
    const velocity = (now - penetrationAtReceipt) / Math.max(1, this.config.evaluationDelay);
    const velocityRef = ref / Math.max(1, this.config.evaluationDelay);

    const penScore = clamp(now / (2 * ref), 0, 1);
    const velScore = clamp(0.5 + velocity / (2 * velocityRef), 0, 1);
    return clamp(0.55 * penScore + 0.45 * velScore, 0, 1);
  }

  /** Upper-quantile penetration among live memes — the yardstick for "went viral". */
  private referencePenetration = 0.02;

  private updateReferencePenetration(): void {
    const pens: number[] = [];
    for (const id of this.memes.keys()) {
      const held = this.holders.get(id)?.size ?? 0;
      if (held > 0) pens.push(held / this.agents.length);
    }
    if (pens.length < 4) return;
    pens.sort((a, b) => a - b);
    const p85 = pens[Math.min(pens.length - 1, Math.floor(pens.length * 0.85))];
    // Ease toward the new reading so the yardstick itself does not flicker.
    this.referencePenetration = clamp(
      0.85 * this.referencePenetration + 0.15 * Math.max(p85, 0.01),
      0.01,
      0.6,
    );
  }

  /**
   * Normative social contagion:
   *   rho' = (1 - lambda) rho + lambda * <rho>_neighbours
   *   eps' = (1 - lambda) eps + lambda * <eps>_neighbours
   * Computed against a snapshot so update order does not bias the result.
   */
  private socialContagionPhase(): void {
    const lambda = this.config.conformityRate;
    if (lambda <= 0) return;
    const n = this.agents.length;
    for (let i = 0; i < n; i++) {
      this.rhoScratch[i] = this.agents[i].epistemicRigor;
      this.epsScratch[i] = this.agents[i].emotionalSusceptibility;
    }
    for (let i = 0; i < n; i++) {
      const agent = this.agents[i];
      const nbrs = agent.neighbors;
      if (nbrs.length === 0) continue;
      let sumRho = 0;
      let sumEps = 0;
      for (const j of nbrs) {
        sumRho += this.rhoScratch[j];
        sumEps += this.epsScratch[j];
      }
      const meanRho = sumRho / nbrs.length;
      const meanEps = sumEps / nbrs.length;
      agent.epistemicRigor = clamp(
        (1 - lambda) * agent.epistemicRigor + lambda * meanRho,
        0.05,
        0.95,
      );
      agent.emotionalSusceptibility = clamp(
        (1 - lambda) * agent.emotionalSusceptibility + lambda * meanEps,
        0.02,
        0.98,
      );
    }
  }

  /** Conviction decays; forgotten memes leave the inventory and may die out. */
  private decayPhase(): void {
    const decay = this.config.convictionDecay;
    for (const agent of this.agents) {
      for (const [id, memory] of agent.memeMemory) {
        const age = this.tick - memory.lastSeen;
        memory.familiarity *= Math.exp(-1 / 48);
        memory.fatigue *= Math.exp(-1 / 30);
        if (age > 180 && memory.familiarity < 0.03) agent.memeMemory.delete(id);
      }
      for (const [id, entry] of agent.inventory) {
        entry.conviction -= decay;
        if (entry.conviction <= 0.05) this.dropMeme(agent, id);
      }
    }
    if (this.tick % 12 === 0) this.sweepDeadMemes();
  }

  /**
   * Retire extinct memes. Mutation mints a new variant on every re-broadcast,
   * and most are stillborn: if they are not cleared out the pool balloons,
   * every individual meme's share of the network trends to nothing, and the
   * retrospective trust signal stops meaning anything. Variants that actually
   * caught on are kept far longer so the phylogeny tree stays intact.
   */
  private sweepDeadMemes(): void {
    // Keep roots, live ancestry, and pending retrospective receipts intact.
    const keep = new Set(this.roots.map(m => m.id));
    for (const a of this.agents) {
      for (const id of a.inventory.keys()) keep.add(id);
      for (const receipt of a.pendingMemeReceipts) keep.add(receipt.memeId);
    }
    for (const m of this.memes.values()) if (this.tick - m.originTick <= 160) keep.add(m.id);
    for (const id of keep) {
      let parent = this.memes.get(id)?.parentId;
      while (parent && !keep.has(parent)) { keep.add(parent); parent = this.memes.get(parent)?.parentId; }
    }
    for (const [id, meme] of this.memes) {
      meme.alive = (this.holders.get(id)?.size ?? 0) > 0;
      if (!keep.has(id)) { this.archivedMemes.set(id, meme); this.memes.delete(id); this.holders.delete(id); }
    }
  }

  private samplePenetration(): void {
    for (const [id, meme] of this.memes) {
      const p = this.penetration(id);
      meme.penetrationHistory.push(p);
      if (meme.penetrationHistory.length > 200) meme.penetrationHistory.shift();
      if (p > meme.peakPenetration) meme.peakPenetration = p;
    }
  }

  // ------------------------------------------------------------- projection

  recomputeProjection(force = false): void {
    const vectors = this.agents.map((a) => a.worldview);
    if (force) this.projector.fit(vectors, 48);
    for (const agent of this.agents) {
      const [x, y] = this.projector.project(agent.worldview);
      agent.x = x;
      agent.y = y;
      pushTrail(agent, x, y);
    }
  }

  private recordPlasticity(): void {
    for (const agent of this.agents) {
      agent.plasticityHistory.push({
        tick: this.tick,
        rigor: agent.epistemicRigor,
        susceptibility: agent.emotionalSusceptibility,
        confidence: agent.boundedConfidence,
      });
      if (agent.plasticityHistory.length > PLASTICITY_CAPACITY) agent.plasticityHistory.shift();
    }
  }

  // ---------------------------------------------------------------- metrics

  private recordMetrics(): void {
    const n = this.agents.length;
    for (let i = 0; i < n; i++) this.rhoView[i] = this.agents[i].epistemicRigor;
    const rho = mean(this.rhoView);

    let epsSum = 0;
    let trustSum = 0;
    let trustCount = 0;
    for (const a of this.agents) {
      epsSum += a.emotionalSusceptibility;
      for (const t of a.peerTrust.values()) {
        trustSum += t;
        trustCount++;
      }
    }

    // Meme climate: conviction-weighted share of circulating content that is rational.
    let rationalMass = 0;
    let totalMass = 0;
    for (const agent of this.agents) {
      for (const e of agent.inventory.values()) {
        totalMass += e.conviction;
        rationalMass += e.conviction * (1 - e.meme.irrationality);
      }
    }

    // Polarisation is measured on ideological position (the leading principal
    // component of the worldview cloud), not on the rigor trait: two camps that
    // loathe each other can be equally rigorous, and the split we care about is
    // where the population sits, not how carefully it thinks.
    for (let i = 0; i < n; i++) this.pc1View[i] = this.agents[i].x;

    this.rationalityHistory.push(rho);
    this.climateHistory.push(totalMass > 0 ? rationalMass / totalMass : 0.5);
    this.bimodalityHistory.push(bimodalityCoefficient(this.pc1View));
    this.susceptibilityHistory.push(epsSum / n);
    this.lastTrust = trustCount ? trustSum / trustCount : 0.5;
    this.lastRigorSpread = stddev(this.rhoView, rho);
  }

  private lastTrust = 0.5;
  private lastRigorSpread = 0;

  metrics(): Metrics {
    let live = 0, liveMutations = 0;
    for (const [id, meme] of this.memes) if ((this.holders.get(id)?.size ?? 0) > 0) {
      live++;
      if (meme.generation > 0) liveMutations++;
    }
    const totalMemesCreated = this.roots.length + this.generatedMutations;
    return {
      tick: this.tick,
      rationalityIndex: this.rationalityHistory.last,
      rigorSpread: this.lastRigorSpread,
      susceptibility: this.susceptibilityHistory.last,
      climateIndex: this.climateHistory.last,
      bimodality: this.bimodalityHistory.last,
      meanTrust: this.lastTrust,
      adoptionsPerTick: this.adoptionsEma,
      liveMemes: live,
      generatedMutations: this.generatedMutations,
      totalMemesCreated,
      mutatedShare: totalMemesCreated ? this.generatedMutations / totalMemesCreated : 0,
      liveMutations,
      liveMutatedShare: live ? liveMutations / live : 0,
      maxGeneration: this.maxGeneration,
      clustering: this.clustering,
    };
  }

  // ----------------------------------------------------------------- pulses

  private pushPulse(from: number, to: number, irrationality: number, accepted: boolean): void {
    if (this.pulses.length > 900) return;
    this.pulses.push({ from, to, irrationality, accepted, born: this.tick });
  }

  private agePulses(): void {
    const cutoff = this.tick - 3;
    let write = 0;
    for (let i = 0; i < this.pulses.length; i++) {
      if (this.pulses[i].born > cutoff) this.pulses[write++] = this.pulses[i];
    }
    this.pulses.length = write;
  }

  // ------------------------------------------------------------- reporting

  /** Ranked meme table: R0, irrationality, generational depth, reach. */
  getMeme(id: string): Meme | undefined {
    return this.memes.get(id) ?? this.archivedMemes.get(id);
  }

  rankedMemes(limit = 14, view: 'circulating' | 'mutations' | 'roots' | 'extinct' = 'circulating', query = '') {
    const rows = [];
    const needle = query.trim().toLowerCase();
    const candidates = view === 'extinct' ? [...this.memes.values(), ...this.archivedMemes.values()] : this.memes.values();
    for (const meme of candidates) {
      if (needle && !`${meme.id} ${meme.rootId} ${meme.text}`.toLowerCase().includes(needle)) continue;
      const held = this.holders.get(meme.id)?.size ?? 0;
      if (view === 'circulating' && held === 0) continue;
      if (view === 'extinct' && held > 0) continue;
      if (view === 'mutations' && meme.generation === 0) continue;
      if (view === 'roots' && meme.generation !== 0) continue;
      rows.push({
        meme,
        penetration: held / this.agents.length,
        r0: reproductionNumber(meme, this.config.fanout),
        held,
      });
    }
    if (view === 'mutations' || view === 'extinct') rows.sort((a, b) => b.meme.originTick - a.meme.originTick || b.meme.generation - a.meme.generation);
    else rows.sort((a, b) => b.r0 * (0.3 + b.penetration) - a.r0 * (0.3 + a.penetration));
    return rows.slice(0, limit);
  }

  /** Plain-language account of why a given meme spread the way it did. */
  explainMeme(memeId: string): string {
    const meme = this.getMeme(memeId);
    if (!meme) return 'This meme is not in the current run.';
    const held = this.holders.get(memeId)?.size ?? 0;
    const pen = held / this.agents.length;
    const r0 = reproductionNumber(meme, this.config.fanout);

    // Who is holding it, and how rigorous are they?
    let rigorSum = 0;
    let susSum = 0;
    const carriers = this.holders.get(memeId);
    if (carriers) {
      for (const idx of carriers) {
        rigorSum += this.agents[idx].epistemicRigor;
        susSum += this.agents[idx].emotionalSusceptibility;
      }
    }
    const carrierRigor = held ? rigorSum / held : 0;
    const carrierSus = held ? susSum / held : 0;
    const popRigor = this.rationalityHistory.last;

    // Trust credited to senders of this meme over the evaluation window.
    let trustGain = 0;
    let trustAgents = 0;
    for (const agent of this.agents) {
      for (const ev of agent.trustEvents) {
        if (this.tick - ev.tick > 60) continue;
        if (ev.delta > 0 && agent.inventory.has(memeId)) {
          trustGain += ev.delta;
          trustAgents++;
        }
      }
    }

    const parts: string[] = [];
    if (held === 0) parts.push(`Extinct / unheld: no agents currently carry this variant. It recorded ${meme.adoptionCount} adoptions and ${meme.exposureCount} exposures. Its lineage and selection record remain available until the run resets.`);
    if (meme.irrationality > 0.6 && meme.virality > 0.6) {
      parts.push(
        `High-virality exploit. At irrationality ${meme.irrationality.toFixed(2)} it carries low parsing cost ` +
          `(${meme.cognitiveLoad.toFixed(2)}), so the rigor term in the acceptance function barely bites.`,
      );
    } else if (meme.irrationality < 0.35) {
      parts.push(
        `Costly truth. Cognitive load ${meme.cognitiveLoad.toFixed(2)} against virality ${meme.virality.toFixed(2)} ` +
          `means it only lands where rigor is already high enough to pay the parsing cost.`,
      );
    } else {
      parts.push(
        `Mid-spectrum claim (irrationality ${meme.irrationality.toFixed(2)}) with no strong structural advantage ` +
          `either way; spread depends almost entirely on who happened to carry it first.`,
      );
    }

    if (held > 0) {
      parts.push(
        `It settled in a cluster with mean rigor ${carrierRigor.toFixed(2)} versus ${popRigor.toFixed(2)} population-wide ` +
          `and mean susceptibility ${carrierSus.toFixed(2)}.`,
      );
    }
    if (trustAgents > 0) {
      parts.push(
        `Subsequent reach credited its senders with +${trustGain.toFixed(2)} of trust across ${trustAgents} judgements, ` +
          `which lowers resistance to whatever those senders share next.`,
      );
    }
    parts.push(
      `Generation ${meme.generation}, R₀ ${r0.toFixed(2)}, peak reach ${(meme.peakPenetration * 100).toFixed(1)}%, ` +
        `now held by ${(pen * 100).toFixed(1)}% of agents.`,
    );
    return parts.join(' ');
  }

  /** Lineage tree rooted at a meme's root ancestor. */
  lineage(memeId: string): { meme: Meme; depth: number }[] {
    const meme = this.getMeme(memeId);
    if (!meme) return [];
    const family = [...this.memes.values(), ...this.archivedMemes.values()].filter((m) => m.rootId === meme.rootId);
    const byParent = new Map<string | null, Meme[]>();
    for (const m of family) {
      const parentIds = m.parentIds?.length ? m.parentIds : m.parentId ? [m.parentId] : [null];
      for (const key of parentIds) {
        if (!byParent.has(key)) byParent.set(key, []);
        byParent.get(key)!.push(m);
      }
    }
    const root = this.getMeme(meme.rootId);
    const out: { meme: Meme; depth: number }[] = [];
    const stack = root ? [{ meme: root, depth: 0 }] : [];
    const seen = new Set<string>();
    while (stack.length) {
      const entry = stack.pop()!;
      if (seen.has(entry.meme.id)) continue;
      seen.add(entry.meme.id);
      out.push(entry);
      const kids = (byParent.get(entry.meme.id) ?? []).sort((a, b) => b.adoptionCount - a.adoptionCount);
      for (let i = kids.length - 1; i >= 0; i--) stack.push({ meme: kids[i], depth: entry.depth + 1 });
    }
    return out;
  }

  /** Top and bottom trusted peers for the inspector table. */
  trustTable(agent: Agent, size = 5) {
    const entries = [...agent.peerTrust.entries()].map(([peerId, trust]) => {
      const events = agent.trustEvents.filter((e) => e.peerId === peerId);
      const net = events.reduce((s, e) => s + e.delta, 0);
      const latest = events[events.length - 1];
      return {
        peerId,
        peerIndex: Number(peerId.slice(1)),
        trust,
        net,
        events: events.length,
        reason: latest?.reason ?? 'no completed evaluations yet',
      };
    });
    entries.sort((a, b) => b.trust - a.trust);
    return {
      trusted: entries.slice(0, size),
      distrusted: entries.slice(-size).reverse(),
    };
  }

  agentDiet(agent: Agent): number {
    return mediaDiet(agent);
  }
}
