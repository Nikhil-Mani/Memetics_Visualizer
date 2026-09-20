import { D, dot, normalize, zeros, type Vec } from './vector';

/** Matrix-free PCA: O(iterations × samples × dimensions), no dense covariance. */
export class PcaProjector {
  mean: Vec = zeros();
  pc1: Vec = zeros();
  pc2: Vec = zeros();
  explained: [number, number] = [0, 0];
  constructor() {
    for (let i = 0; i < D; i++) { this.pc1[i] = Math.sin(i + 1); this.pc2[i] = Math.cos(i + 1); }
    normalize(this.pc1); normalize(this.pc2);
  }
  fit(vectors: Vec[], iterations = 48): void {
    if (vectors.length < 3) return;
    this.mean.fill(0);
    for (const v of vectors) for (let d = 0; d < D; d++) this.mean[d] += v[d] / vectors.length;
    const centered = vectors.map(v => Float64Array.from(v, (x, d) => x - this.mean[d]));
    const multiply = (v: Vec) => {
      const out = zeros();
      for (const row of centered) {
        const scale = dot(row, v) / (vectors.length - 1);
        for (let d = 0; d < D; d++) out[d] += scale * row[d];
      }
      return out;
    };
    const iterate = (seed: Vec, orthogonal?: Vec): Vec => {
      let v: Vec = new Float64Array(seed);
      for (let i = 0; i < iterations; i++) {
        const next = multiply(v);
        if (orthogonal) {
          const along = dot(next, orthogonal);
          for (let d = 0; d < D; d++) next[d] -= along * orthogonal[d];
        }
        if (dot(next, next) < 1e-24) break;
        v = normalize(next);
      }
      if (dot(v, seed) < 0) for (let d = 0; d < D; d++) v[d] *= -1;
      return v;
    };
    this.pc1 = iterate(this.pc1);
    this.pc2 = iterate(this.pc2, this.pc1);
    const trace = centered.reduce((s, v) => s + dot(v, v), 0) / (vectors.length - 1);
    this.explained = trace > 1e-12 ? [dot(this.pc1, multiply(this.pc1)) / trace, dot(this.pc2, multiply(this.pc2)) / trace] : [0, 0];
  }
  project(v: Vec): [number, number] {
    let x = 0, y = 0;
    for (let d = 0; d < D; d++) { const c = v[d] - this.mean[d]; x += c * this.pc1[d]; y += c * this.pc2[d]; }
    return [x, y];
  }
}
