import type { Rng } from '../math/random';
import { D, normalize, zeros, type Vec } from '../math/vector';
import type { MemeSeed } from '../types/Meme';

/**
 * Seed content. Each entry carries an irrationality coordinate and a loading
 * across the six latent axes, so semantically adjacent ideas land near each
 * other in the projection instead of scattering at random.
 *
 * Axis order: rigor, autonomy, institutional trust, optimism, humanism, nuance.
 */
interface SeedSpec {
  label: string;
  irrationality: number;
  loadings: number[];
}

const LIBRARY: SeedSpec[] = [
  { label: 'Effect size shrank on replication', irrationality: 0.04, loadings: [1, 0.2, 0.4, 0.1, 0.2, 0.9] },
  { label: 'Costs fell faster than the forecast', irrationality: 0.09, loadings: [0.9, 0.1, 0.3, 0.8, 0.2, 0.6] },
  { label: 'The sample was never representative', irrationality: 0.12, loadings: [0.95, 0.3, 0.1, -0.1, 0.1, 0.8] },
  { label: 'Two mechanisms, similar outcome', irrationality: 0.16, loadings: [0.85, 0.2, 0.2, 0.2, 0.4, 0.95] },
  { label: 'Audit found a reporting gap', irrationality: 0.22, loadings: [0.7, 0.3, -0.3, -0.2, 0.2, 0.6] },
  { label: 'Local pilots beat national mandates', irrationality: 0.3, loadings: [0.5, 0.9, -0.2, 0.3, 0.1, 0.4] },
  { label: 'Trade-offs were never priced in', irrationality: 0.36, loadings: [0.5, 0.4, -0.4, -0.3, 0.1, 0.5] },
  { label: 'Experts talk past ordinary people', irrationality: 0.46, loadings: [-0.1, 0.6, -0.6, -0.2, -0.2, 0.1] },
  { label: 'The numbers are being massaged', irrationality: 0.56, loadings: [-0.3, 0.5, -0.8, -0.4, -0.2, -0.1] },
  { label: 'Only outsiders tell the truth now', irrationality: 0.64, loadings: [-0.4, 0.7, -0.85, -0.3, -0.3, -0.3] },
  { label: 'They profit from the panic', irrationality: 0.72, loadings: [-0.6, 0.4, -0.95, -0.7, -0.4, -0.5] },
  { label: 'Our people are being written out', irrationality: 0.79, loadings: [-0.7, -0.3, -0.8, -0.6, -0.95, -0.6] },
  { label: 'The collapse is already scheduled', irrationality: 0.86, loadings: [-0.8, -0.2, -0.85, -1, -0.5, -0.7] },
  { label: 'Secret bio-weapon programme', irrationality: 0.91, loadings: [-0.9, -0.1, -1, -0.9, -0.6, -0.85] },
  { label: 'Everything is one coordinated plan', irrationality: 0.96, loadings: [-1, -0.5, -1, -0.8, -0.7, -0.95] },
];

function toVector(loadings: number[], rng: Rng, jitter = 0.18): Vec {
  const v = zeros(D);
  for (let i = 0; i < D; i++) v[i] = (loadings[i] ?? 0) + rng.normal(0, jitter);
  return normalize(v);
}

/** Draw a seed whose irrationality sits near `target`. */
export function drawSeed(target: number, rng: Rng, spread = 0.12): MemeSeed {
  let best = LIBRARY[0];
  let bestScore = Infinity;
  const wanted = Math.min(1, Math.max(0, target + rng.normal(0, spread)));
  for (const spec of LIBRARY) {
    const score = Math.abs(spec.irrationality - wanted) + rng.next() * 0.08;
    if (score < bestScore) {
      bestScore = score;
      best = spec;
    }
  }
  return {
    label: best.label,
    irrationality: Math.min(1, Math.max(0, best.irrationality + rng.normal(0, 0.05))),
    vector: toVector(best.loadings, rng),
  };
}

/** A spread of seeds covering the whole spectrum, for initial population. */
export function drawSpectrum(count: number, rng: Rng): MemeSeed[] {
  const seeds: MemeSeed[] = [];
  for (let i = 0; i < count; i++) {
    seeds.push(drawSeed((i + 0.5) / count, rng, 0.06));
  }
  return rng.shuffle(seeds);
}
