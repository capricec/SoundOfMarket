import type { Bar, SymbolId } from "./types";

export function gap(last: number, rolling: number | null): number | null {
  if (rolling == null || rolling === 0) return null;
  return (last - rolling) / rolling;
}

export function smaAt(values: number[], end: number, window: number): number | null {
  if (window < 1 || end < window - 1 || end >= values.length) return null;
  let sum = 0;
  for (let i = end - window + 1; i <= end; i += 1) sum += values[i];
  return sum / window;
}

export function emaAt(values: number[], end: number, window: number): number | null {
  if (window < 1 || end < window - 1 || end >= values.length) return null;
  const k = 2 / (window + 1);
  let prev = 0;
  for (let i = 0; i < window; i += 1) prev += values[i];
  prev /= window;
  for (let i = window; i <= end; i += 1) prev = values[i] * k + prev * (1 - k);
  return prev;
}

export function bollingerAt(
  values: number[],
  end: number,
  window: number,
  deviations = 2,
): { middle: number; upper: number; lower: number } | null {
  const middle = smaAt(values, end, window);
  if (middle == null || end < window - 1) return null;
  let sq = 0;
  for (let i = end - window + 1; i <= end; i += 1) {
    const d = values[i] - middle;
    sq += d * d;
  }
  const sd = Math.sqrt(sq / window);
  return { middle, upper: middle + deviations * sd, lower: middle - deviations * sd };
}

/** Next close that sits `targetGap` above the SMA that includes that close. */
export function closeForGap(previous: number[], window: number, targetGap: number): number {
  const prior = window - 1;
  if (previous.length < prior) throw new Error("Not enough history to place a close on its average");
  let sum = 0;
  for (let i = previous.length - prior; i < previous.length; i += 1) sum += previous[i];
  const scale = 1 + targetGap;
  return sum / (window / scale - 1);
}

export function returnsThrough(values: number[], end: number, window: number): number[] | null {
  if (end < window || end >= values.length) return null;
  const out: number[] = [];
  for (let i = end - window + 1; i <= end; i += 1) {
    const prev = values[i - 1];
    if (prev === 0) return null;
    out.push(values[i] / prev - 1);
  }
  return out;
}

export function pearson(xs: number[], ys: number[]): number | null {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return null;
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (let i = 0; i < n; i += 1) {
    sx += xs[i];
    sy += ys[i];
    sxx += xs[i] * xs[i];
    syy += ys[i] * ys[i];
    sxy += xs[i] * ys[i];
  }
  const cov = sxy - (sx * sy) / n;
  const vx = sxx - (sx * sx) / n;
  const vy = syy - (sy * sy) / n;
  if (vx <= 1e-12 || vy <= 1e-12) return null;
  return cov / Math.sqrt(vx * vy);
}

export function column(bars: Bar[], id: SymbolId): number[] {
  return bars.map((bar) => bar[id]);
}

export function rollingSeries(
  values: number[],
  window: number,
  kind: "sma" | "ema",
): (number | null)[] {
  return values.map((_, index) => (kind === "sma" ? smaAt(values, index, window) : emaAt(values, index, window)));
}
