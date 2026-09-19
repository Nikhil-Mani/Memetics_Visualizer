import { Rng } from '../math/random';
import { PcaProjector } from '../math/pca';
import { bimodalityCoefficient, History, mean, stddev } from '../math/stats';
import {
  clamp,
  D,
  dot,
  jitterUnit,
  lerpNormalized,
  randomUnit,
  sigmoid,
  type Vec,
} from '../math/vector';
import {
  createMeme,
  mutateMeme,
  reproductionNumber,
  resetMemeCounter,
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
import { drawSeed, drawSpectrum } from './memeLibrary';
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
  clustering: number;
}

const PCA_INTERVAL = 6;
const PENETRATION_SAMPLE = 5;

export class MemeticEngine {
  config: SimConfig;
  rng: Rng;
  tick = 0;

  agents: Agent[] = [];
  memes = new Map<string, Meme>();
  holders = new Map<string, Set<number>>();
  pulses: BroadcastPulse[] = [];

  projector = new PcaProjector();
  clustering = 0;

  rationalityHistory = new History();
  climateHistory = new History();
  bimodalityHistory = new History();
  susceptibilityHistory = new History();

  private adoptionsThisTick = 0;
  private adoptionsEma = 0;
  private rhoScratch: Float64Array = new Float64Array(0);
  private epsScratch: Float64Array = new Float64Array(0);
  private rhoView: Float64Array = new Float64Array(0);
  private pc1View: Float64Array = new Float64Array(0);

  constructor(config: SimConfig = DEFAULT_CONFIG) {
    this.config = { ...config };
    this.rng = new Rng(config.seed);
    this.reset(this.config);
  }

  // ---------------------------------------------------------------- lifecycle

  reset(config: SimConfig = this.config): void {
    this.config = { ...config };
    this.rng = new Rng(config.seed);
    this.tick = 0;
    this.memes.clear();
    this.holders.clear();
    this.pulses = [];
    this.adoptionsEma = 0;
    resetMemeCounter();
    this.rationalityHistory = new History();
    this.climateHistory = new History();
    this.bimodalityHistory = new History();
    this.susceptibilityHistory = new History();
    this.projector = new PcaProjector();

    const n = config.agentCount;
    const adjacency = buildSmallWorld(n, config.meanDegree, config.rewireProbability, this.rng);
    this.clustering = clusteringCoefficient(adjacency);

    // Community anchors: agents near each other on the ring start ideologically
    // close, which is what lets low rewiring produce genuine echo chambers.
    const communityCount = Math.max(3, Math.round(n / 60));
    const anchors: Vec[] = Array.from({ length: communityCount }, () => randomUnit(this.rng, D));

    this.agents = [];
    for (let i = 0; i < n; i++) {
      const anchor = anchors[Math.floor((i / n) * communityCount) % communityCount];
      const agent: Agent = {
        id: `a${i}`,
        index: i,
        worldview: jitterUnit(anchor, 0.45, this.rng),
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
        peerTrust: new Map(),
        pendingMemeReceipts: [],
        trustEvents: [],
        inventory: new Map(),
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

    // Seed the population with content spanning the whole spectrum.
    // Half the starting content spans the whole spectrum (so the semantic map
    // has structure from tick 0) and half sits near the feed's centre of
    // gravity, because a run's media environment is consistent with itself —
    // a conspiratorial feed does not arrive into a neutral back catalogue.
    const seedCount = Math.max(8, Math.round(n / 22));
    const seeds = [
      ...drawSpectrum(Math.ceil(seedCount / 2), this.rng),
      ...Array.from({ length: Math.floor(seedCount / 2) }, () =>
        drawSeed(config.injectionIrrationality, this.rng, 0.16),
      ),
    ];
    for (const seed of seeds) {
      const origin = this.agents[this.rng.int(n)];
      seed.vector = lerpNormalized(seed.vector, origin.worldview, 0.4);
      const meme = createMeme(seed, 0, this.rng);
      this.registerMeme(meme);
      this.grantMeme(origin, meme, 0.5 + this.rng.next() * 0.3);
      const carriers = this.rng.int(3);
      for (let c = 0; c < carriers; c++) {
        const pool = origin.neighbors;
        const target = pool.length ? this.agents[pool[this.rng.int(pool.length)]] : origin;
        this.grantMeme(target, meme, 0.5 + this.rng.next() * 0.3);
      }
    }

    this.recomputeProjection(true);
    this.recordMetrics();
  }

  // ------------------------------------------------------------------- memes

  private registerMeme(meme: Meme): void {
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
    this.tick++;
    this.adoptionsThisTick = 0;
    for (const a of this.agents) a.adoptionsThisTick = 0;

    this.injectContent();
    this.broadcastPhase();
    this.retrospectiveTrustPhase();
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

  /**
   * Spawn a meme and hand it to a seed cluster.
   *
   * Content is oriented partly toward the worldview of whoever first voices it,
   * not dropped in at an abstract library coordinate. Ideas are articulated from
   * inside a community, and a meme aimed at a corner of the semantic space that
   * nobody occupies is simply filtered out by the bounded-confidence gate before
   * it can ever be judged on its merits — no cascade can start from there.
   * `groundedness` is how far the wording bends toward the speaker.
   */
  private spawnMeme(
    targetIrrationality: number,
    carrierCount: number,
    conviction: number,
    groundedness: number,
    spread: number,
  ): Meme {
    const origin = this.agents[this.rng.int(this.agents.length)];
    const seed = drawSeed(targetIrrationality, this.rng, spread);
    seed.vector = lerpNormalized(seed.vector, origin.worldview, groundedness);
    const meme = createMeme(seed, this.tick, this.rng);
    this.registerMeme(meme);

    // The seed cluster is the speaker plus a few of their neighbours, so the
    // idea starts where it would actually start: inside one social pocket.
    this.grantMeme(origin, meme, conviction);
    for (let c = 1; c < carrierCount; c++) {
      const pool = origin.neighbors;
      const target =
        pool.length > 0 && this.rng.next() < 0.75
          ? this.agents[pool[this.rng.int(pool.length)]]
          : this.agents[this.rng.int(this.agents.length)];
      this.grantMeme(target, meme, conviction);
    }
    return meme;
  }

  /** New content enters the ecosystem each tick. */
  private injectContent(): void {
    let budget = this.config.injectionRate;
    while (budget > 0) {
      if (budget < 1 && this.rng.next() > budget) break;
      this.spawnMeme(this.config.injectionIrrationality, 1 + this.rng.int(2), 0.55, 0.45, 0.14);
      budget -= 1;
    }
  }

  /** Inject a specific meme at the user's request (control panel). */
  injectMeme(irrationality: number, carriers = 5): Meme {
    return this.spawnMeme(irrationality, carriers, 0.75, 0.5, 0.04);
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
        payload = mutateMeme(entry.meme, this.tick, this.rng);
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
    const pAccept = sigmoid(z);
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
    receiver.worldview = lerpNormalized(before, meme.vector, receiver.learningRate);
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
    for (const [id, meme] of this.memes) {
      const held = this.holders.get(id)?.size ?? 0;
      if (held > 0) {
        meme.alive = true;
        continue;
      }
      meme.alive = false;
      const age = this.tick - meme.originTick;
      const stillborn = meme.adoptionCount < 2 && age > 24;
      const forgotten = meme.adoptionCount < 12 && age > 160;
      if (stillborn || forgotten) {
        this.memes.delete(id);
        this.holders.delete(id);
      }
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
    this.projector.fit(vectors, force ? 64 : 24);
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
    let live = 0;
    for (const id of this.memes.keys()) if ((this.holders.get(id)?.size ?? 0) > 0) live++;
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
  rankedMemes(limit = 14) {
    const rows = [];
    for (const meme of this.memes.values()) {
      const held = this.holders.get(meme.id)?.size ?? 0;
      if (meme.exposureCount === 0 && held === 0) continue;
      rows.push({
        meme,
        penetration: held / this.agents.length,
        r0: reproductionNumber(meme, this.config.fanout),
        held,
      });
    }
    rows.sort((a, b) => b.r0 * (0.3 + b.penetration) - a.r0 * (0.3 + a.penetration));
    return rows.slice(0, limit);
  }

  /** Plain-language account of why a given meme spread the way it did. */
  explainMeme(memeId: string): string {
    const meme = this.memes.get(memeId);
    if (!meme) return 'This meme is no longer in circulation.';
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
    const meme = this.memes.get(memeId);
    if (!meme) return [];
    const family = [...this.memes.values()].filter((m) => m.rootId === meme.rootId);
    const byParent = new Map<string | null, Meme[]>();
    for (const m of family) {
      const key = m.parentId;
      if (!byParent.has(key)) byParent.set(key, []);
      byParent.get(key)!.push(m);
    }
    const root = family.find((m) => m.parentId === null || !this.memes.has(m.parentId));
    const out: { meme: Meme; depth: number }[] = [];
    const walk = (node: Meme, depth: number) => {
      out.push({ meme: node, depth });
      if (depth > 8 || out.length > 60) return;
      const kids = (byParent.get(node.id) ?? []).sort(
        (a, b) => b.adoptionCount - a.adoptionCount,
      );
      for (const kid of kids) walk(kid, depth + 1);
    };
    if (root) walk(root, 0);
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
