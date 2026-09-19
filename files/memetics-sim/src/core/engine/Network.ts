import type { Rng } from '../math/random';

/**
 * Watts–Strogatz small world. `rewire` near 0 gives lattice-like, highly
 * clustered communities (the substrate for echo chambers); near 1 gives a
 * random graph where anything can reach anything in a few hops.
 */
export function buildSmallWorld(
  n: number,
  meanDegree: number,
  rewire: number,
  rng: Rng,
): number[][] {
  const k = Math.max(2, Math.round(meanDegree / 2));
  const sets: Set<number>[] = Array.from({ length: n }, () => new Set<number>());

  for (let i = 0; i < n; i++) {
    for (let j = 1; j <= k; j++) {
      const target = (i + j) % n;
      if (target !== i) {
        sets[i].add(target);
        sets[target].add(i);
      }
    }
  }

  for (let i = 0; i < n; i++) {
    for (const target of Array.from(sets[i])) {
      if (rng.next() >= rewire) continue;
      let candidate = rng.int(n);
      let guard = 0;
      while ((candidate === i || sets[i].has(candidate)) && guard++ < 16) candidate = rng.int(n);
      if (candidate === i || sets[i].has(candidate)) continue;
      sets[i].delete(target);
      sets[target].delete(i);
      sets[i].add(candidate);
      sets[candidate].add(i);
    }
  }

  // Nobody is allowed to be fully isolated — an unreachable agent is noise.
  for (let i = 0; i < n; i++) {
    if (sets[i].size === 0) {
      const partner = (i + 1) % n;
      sets[i].add(partner);
      sets[partner].add(i);
    }
  }

  return sets.map((s) => Array.from(s));
}

/** Mean clustering coefficient — reported in the UI so presets are legible. */
export function clusteringCoefficient(adjacency: number[][]): number {
  let total = 0;
  let counted = 0;
  const lookup = adjacency.map((a) => new Set(a));
  for (let i = 0; i < adjacency.length; i++) {
    const nbrs = adjacency[i];
    if (nbrs.length < 2) continue;
    let links = 0;
    for (let a = 0; a < nbrs.length; a++) {
      for (let b = a + 1; b < nbrs.length; b++) {
        if (lookup[nbrs[a]].has(nbrs[b])) links++;
      }
    }
    total += (2 * links) / (nbrs.length * (nbrs.length - 1));
    counted++;
  }
  return counted ? total / counted : 0;
}
