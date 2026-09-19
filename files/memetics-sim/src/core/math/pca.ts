import { D, dot, normalize, zeros, type Vec } from './vector';

/**
 * Two-component PCA for the 6-D worldview cloud.
 *
 * The covariance is only 6x6, so power iteration with deflation converges in
 * a handful of passes and costs far less than a full eigensolver. The basis is
 * recomputed on an interval and sign-locked against the previous basis, so the
 * scatter plot does not flip axes between recomputes and the migration trails
 * stay meaningful.
 */
export class PcaProjector {
  mean: Vec = zeros(D);
  pc1: Vec = zeros(D);
  pc2: Vec = zeros(D);
  explained: [number, number] = [0, 0];
  private initialised = false;

  constructor() {
    this.pc1[0] = 1;
    this.pc2[1] = 1;
  }

  fit(vectors: Vec[], iterations = 48): void {
    const n = vectors.length;
    if (n < 3) return;

    const mean = zeros(D);
    for (const v of vectors) for (let i = 0; i < D; i++) mean[i] += v[i];
    for (let i = 0; i < D; i++) mean[i] /= n;

    // Covariance (6x6, symmetric).
    const cov = new Float64Array(D * D);
    const centred = zeros(D);
    for (const v of vectors) {
      for (let i = 0; i < D; i++) centred[i] = v[i] - mean[i];
      for (let i = 0; i < D; i++) {
        for (let j = i; j < D; j++) {
          cov[i * D + j] += centred[i] * centred[j];
        }
      }
    }
    for (let i = 0; i < D; i++) {
      for (let j = i; j < D; j++) {
        cov[i * D + j] /= n - 1;
        cov[j * D + i] = cov[i * D + j];
      }
    }

    const { vector: v1, value: l1 } = powerIteration(cov, iterations, this.pc1);
    deflate(cov, v1, l1);
    const { vector: v2, value: l2 } = powerIteration(cov, iterations, this.pc2);

    let trace = 0;
    for (let i = 0; i < D; i++) trace += cov[i * D + i];
    trace += l1; // deflation removed the first component from the trace

    this.mean = mean;
    this.pc1 = this.initialised ? signLock(v1, this.pc1) : v1;
    this.pc2 = this.initialised ? signLock(v2, this.pc2) : v2;
    this.explained = [
      trace > 1e-12 ? l1 / trace : 0,
      trace > 1e-12 ? l2 / trace : 0,
    ];
    this.initialised = true;
  }

  /** Project one worldview into the 2-D plane. */
  project(v: Vec): [number, number] {
    let x = 0;
    let y = 0;
    for (let i = 0; i < D; i++) {
      const c = v[i] - this.mean[i];
      x += c * this.pc1[i];
      y += c * this.pc2[i];
    }
    return [x, y];
  }
}

function powerIteration(cov: Float64Array, iterations: number, seed: Vec) {
  let v = normalize(new Float64Array(seed));
  const next = zeros(D);
  let value = 0;
  for (let it = 0; it < iterations; it++) {
    next.fill(0);
    for (let i = 0; i < D; i++) {
      let s = 0;
      for (let j = 0; j < D; j++) s += cov[i * D + j] * v[j];
      next[i] = s;
    }
    const len = Math.sqrt(dot(next, next));
    if (len < 1e-14) break;
    for (let i = 0; i < D; i++) next[i] /= len;
    value = len;
    v = new Float64Array(next);
  }
  return { vector: v, value };
}

/** cov <- cov - lambda * v v^T */
function deflate(cov: Float64Array, v: Vec, value: number): void {
  for (let i = 0; i < D; i++) {
    for (let j = 0; j < D; j++) {
      cov[i * D + j] -= value * v[i] * v[j];
    }
  }
}

/** Keep the new axis pointing the same way as the previous one. */
function signLock(next: Vec, prev: Vec): Vec {
  if (dot(next, prev) < 0) for (let i = 0; i < next.length; i++) next[i] = -next[i];
  return next;
}
