import type { Conditions, Trend } from "../market/types";

export type Pending = Partial<Record<keyof Conditions, number>>;

const FIELDS: (keyof Conditions)[] = ["stockTrend", "bondTrend", "goldTrend", "relationship", "volatility"];

export function commitConditions(
  raw: Conditions,
  committed: Conditions,
  pending: Pending,
  nowMs: number,
  persistenceMs: number,
): { committed: Conditions; pending: Pending } {
  const nextCommitted = { ...committed };
  const nextPending: Pending = { ...pending };
  for (const field of FIELDS) {
    if (raw[field] === committed[field]) {
      delete nextPending[field];
      continue;
    }
    if (persistenceMs <= 0) {
      Object.assign(nextCommitted, { [field]: raw[field] });
      delete nextPending[field];
      continue;
    }
    const since = nextPending[field] ?? nowMs;
    nextPending[field] = since;
    if (nowMs - since >= persistenceMs) {
      Object.assign(nextCommitted, { [field]: raw[field] });
      delete nextPending[field];
    }
  }
  return { committed: nextCommitted, pending: nextPending };
}

export function waitRemaining(pending: Pending, nowMs: number, persistenceMs: number, field: keyof Conditions): number | null {
  const since = pending[field];
  if (since == null || persistenceMs <= 0) return null;
  return Math.max(0, persistenceMs - (nowMs - since));
}

function majorityTrend(samples: Conditions[], field: "stockTrend" | "bondTrend" | "goldTrend"): Trend {
  const rising = samples.filter((sample) => sample[field] === "rising").length;
  const falling = samples.filter((sample) => sample[field] === "falling").length;
  const half = samples.length / 2;
  if (rising > half) return "rising";
  if (falling > half) return "falling";
  return "resting";
}

export function majorityMood(samples: Conditions[]): Conditions {
  if (samples.length === 0) {
    return {
      stockTrend: "resting",
      bondTrend: "resting",
      goldTrend: "resting",
      relationship: "familiar",
      volatility: "calm",
    };
  }
  const half = samples.length / 2;
  return {
    stockTrend: majorityTrend(samples, "stockTrend"),
    bondTrend: majorityTrend(samples, "bondTrend"),
    goldTrend: majorityTrend(samples, "goldTrend"),
    relationship: samples.filter((sample) => sample.relationship === "shifted").length > half ? "shifted" : "familiar",
    volatility: samples.filter((sample) => sample.volatility === "elevated").length > half ? "elevated" : "calm",
  };
}
