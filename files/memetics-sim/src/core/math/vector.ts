import type { Rng } from './random';

/** Latent semantic dimension. */
export const D = 256;

export type Vec = Float64Array;

export function zeros(d = D): Vec {
  return new Float64Array(d);
}

export function dot(a: Vec, b: Vec): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

export function norm(a: Vec): number {
  return Math.sqrt(dot(a, a));
}

/** In-place normalisation onto S^(d-1). Degenerate vectors get a canonical axis. */
export function normalize(a: Vec): Vec {
  const n = norm(a);
  if (n < 1e-12) {
    a.fill(0);
    a[0] = 1;
    return a;
  }
  for (let i = 0; i < a.length; i++) a[i] /= n;
  return a;
}

export function clone(a: Vec): Vec {
  return new Float64Array(a);
}

/** normalize((1 - t) * a + t * b) — geodesic-ish interpolation, written into `out`. */
export function lerpNormalized(a: Vec, b: Vec, t: number, out = zeros(a.length)): Vec {
  for (let i = 0; i < a.length; i++) out[i] = (1 - t) * a[i] + t * b[i];
  return normalize(out);
}

/** Uniform random point on the hypersphere. */
export function randomUnit(rng: Rng, d = D): Vec {
  const v = zeros(d);
  for (let i = 0; i < d; i++) v[i] = rng.normal();
  return normalize(v);
}

/** Sample near `center` with angular spread `sd`. */
export function jitterUnit(center: Vec, sd: number, rng: Rng): Vec {
  const v = clone(center);
  for (let i = 0; i < v.length; i++) v[i] += rng.normal(0, sd);
  return normalize(v);
}

/** M' = normalize(M + N(0, sigma^2 I)) — the mutation operator. */
export function mutateVector(v: Vec, sigma: number, rng: Rng): Vec {
  return jitterUnit(v, sigma, rng);
}

export const clamp = (x: number, lo: number, hi: number): number =>
  x < lo ? lo : x > hi ? hi : x;

export const sigmoid = (z: number): number => 1 / (1 + Math.exp(-z));

export function cosineSimilarity(a: Vec, b: Vec): number {
  const length = norm(a) * norm(b);
  return length > 1e-12 ? clamp(dot(a, b) / length, -1, 1) : 0;
}
export function add(a: Vec, b: Vec): Vec {
  if (a.length !== b.length) throw new Error("Vector dimension mismatch");
  return Float64Array.from(a, (x, i) => x + b[i]);
}
