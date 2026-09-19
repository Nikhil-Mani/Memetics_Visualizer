# Drift — computational memetics and epistemic plasticity

An agent-based simulation of meme transmission where agent traits are mutable:
rigor and susceptibility drift with what each agent consumes, and trust in peers
is rebuilt from how the memes they shared actually performed.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # typecheck + production bundle
```

## Layout

```
src/
  core/math/        vector ops on S^5, power-iteration PCA, Sarle's coefficient, seeded RNG
  core/types/       Meme (continuous irrationality, lineage), Agent (plastic traits, peer trust)
  core/engine/      MemeticEngine (all update equations), network generator, presets, content library
  store/            Zustand store; owns the engine instance and UI state
  components/       control panel, metrics bar, agent inspector, meme table
  components/canvas/ semantic-space and trust-graph canvases + the render loop
```

## Where each equation lives

All of it is in `src/core/engine/MemeticEngine.ts`:

| Mechanic | Method |
| --- | --- |
| Affinity, confidence gate, `P_accept` sigmoid, worldview shift | `transmit` |
| Epistemic fatigue `ρ += δ(0.5 − irr)` | `transmit` (applied on adoption) |
| Retrospective trust, prestige and rigorous rules | `retrospectiveTrustPhase` |
| Virality index `V_M` | `viralityIndex` |
| Normative social contagion toward neighbour means | `socialContagionPhase` |
| Mutation of vector, irrationality and wording | `mutateMeme` in `core/types/Meme.ts` |

## Four modelling decisions worth knowing

These came out of running the model headless and finding the first version
behaved backwards.

1. **`V_M` is scored against the live ecosystem**, not a fixed penetration
   threshold. With a fixed bar, a crowded feed makes every share look like a
   failure and prestige-driven agents punish every peer indiscriminately — mean
   trust collapsed to 0.26 across all scenarios. Now a typical meme scores ~0.5
   and trust only moves on genuine over- or under-performance.
2. **Injected memes are oriented partly toward the worldview of whoever first
   voices them.** Dropped in at an abstract library coordinate, 94% of
   high-irrationality content was filtered by the bounded-confidence gate before
   acceptance was ever evaluated, so no cascade could start.
3. **Stillborn mutants are retired quickly.** Mutation mints a variant on every
   re-broadcast; without a sweep the pool ran to ~5,000 memes and each one's
   share of the network rounded to nothing.
4. **Polarisation is measured on ideological position (PC1), not on the rigor
   trait.** Two camps can be equally rigorous; the split worth tracking is where
   people stand.

Note that the acceptance function penalises cognitive load in proportion to
rigor, so rigorous agents pay *more* to parse demanding content. Rational memes
are structurally disadvantaged — low virality, high parsing cost — which is the
asymmetry the whole model turns on.

## Reading the presets (800 ticks, mean rigor)

- **Epistemic renaissance** — 0.72 → 0.82. Defences train.
- **Conspiratorial cascade** — 0.42 holds flat, then falls to 0.37 and keeps
  going. The plateau-then-collapse shape is the point.
- **Echo chamber balkanisation** — rigor flat near 0.56, polarisation settles
  around 0.54: many self-contained camps rather than two hardened ones.

Runs are deterministic from `config.seed`.
