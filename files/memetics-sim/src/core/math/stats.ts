/** Population mean. */
export function mean(xs: ArrayLike<number>): number {
  if (xs.length === 0) return 0;
  let s = 0;
  for (let i = 0; i < xs.length; i++) s += xs[i];
  return s / xs.length;
}

export function stddev(xs: ArrayLike<number>, mu = mean(xs)): number {
  if (xs.length < 2) return 0;
  let s = 0;
  for (let i = 0; i < xs.length; i++) {
    const d = xs[i] - mu;
    s += d * d;
  }
  return Math.sqrt(s / (xs.length - 1));
}

/**
 * Sarle's bimodality coefficient:
 *
 *   BC = (g^2 + 1) / (k + 3(n-1)^2 / ((n-2)(n-3)))
 *
 * where g is sample skewness and k is sample excess kurtosis. Reference points:
 * a uniform distribution sits at 5/9 ≈ 0.555, a normal at ~0.333. Above 5/9 the
 * population is reading as split into camps rather than as one spread-out mass.
 */
export function bimodalityCoefficient(xs: ArrayLike<number>): number {
  const n = xs.length;
  if (n < 4) return 0;
  const mu = mean(xs);
  let m2 = 0;
  let m3 = 0;
  let m4 = 0;
  for (let i = 0; i < n; i++) {
    const d = xs[i] - mu;
    const d2 = d * d;
    m2 += d2;
    m3 += d2 * d;
    m4 += d2 * d2;
  }
  m2 /= n;
  m3 /= n;
  m4 /= n;
  if (m2 < 1e-12) return 1; // zero variance: total consensus, treat as degenerate spike
  const g = m3 / Math.pow(m2, 1.5);
  const k = m4 / (m2 * m2) - 3;
  const correction = (3 * (n - 1) * (n - 1)) / ((n - 2) * (n - 3));
  return (g * g + 1) / (k + correction);
}

/**
 * Sarle's coefficient detects a two-mode split, so a high reading means two
 * hardened camps; many small self-contained clusters read lower, closer to the
 * uniform reference point.
 */
export function describeBimodality(bc: number): string {
  if (bc < 0.4) return 'One consensus mass';
  if (bc < 5 / 9) return 'Many positions, no clean split';
  if (bc < 0.72) return 'Splitting into two camps';
  return 'Two hardened camps';
}

/** Ring buffer for metric history without unbounded growth. */
export class History {
  readonly values: number[] = [];
  constructor(private readonly capacity = 900) {}

  push(v: number): void {
    this.values.push(v);
    if (this.values.length > this.capacity) this.values.shift();
  }

  get last(): number {
    return this.values.length ? this.values[this.values.length - 1] : 0;
  }

  get first(): number {
    return this.values.length ? this.values[0] : 0;
  }
}
