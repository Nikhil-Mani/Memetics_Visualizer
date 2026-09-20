/** Monochrome luminance: bright = rational, mid-gray = irrational. */
const STOPS: [number, [number, number, number]][] = [
  [0, [245, 245, 240]],
  [1, [125, 125, 125]],
];

export function ramp(t: number): [number, number, number] {
  const x = Math.min(1, Math.max(0, t));
  for (let i = 0; i < STOPS.length - 1; i++) {
    const [p0, c0] = STOPS[i];
    const [p1, c1] = STOPS[i + 1];
    if (x >= p0 && x <= p1) {
      const k = (x - p0) / (p1 - p0 || 1);
      return [
        Math.round(c0[0] + (c1[0] - c0[0]) * k),
        Math.round(c0[1] + (c1[1] - c0[1]) * k),
        Math.round(c0[2] + (c1[2] - c0[2]) * k),
      ];
    }
  }
  return STOPS[STOPS.length - 1][1];
}

/** t = 0 rational … 1 irrational. */
export function rampCss(t: number, alpha = 1): string {
  const [r, g, b] = ramp(t);
  return alpha >= 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${alpha})`;
}

/** Agents are coloured by rigor, so a high-rigor agent reads as bright white. */
export const rigorCss = (rho: number, alpha = 1): string => rampCss(1 - rho, alpha);

export const pct = (x: number, digits = 0): string => `${(x * 100).toFixed(digits)}%`;
export const num = (x: number, digits = 2): string => x.toFixed(digits);
