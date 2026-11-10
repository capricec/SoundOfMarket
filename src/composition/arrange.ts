import type { Conditions, Trend } from "../market/types";
import { HOME_STATE, OPEN_DWELL, type Dwell, type MusicalState, type PartMotion } from "./types";

function motionFrom(trend: Trend): PartMotion {
  if (trend === "rising") return "rising";
  if (trend === "falling") return "falling";
  return "home";
}

export function desiredState(
  signal: Conditions,
  current: MusicalState,
  hasResolveStem: boolean,
): MusicalState {
  let percussion: MusicalState["percussion"];
  if (signal.volatility === "elevated") percussion = "in";
  else if (current.percussion === "in" && hasResolveStem) percussion = "resolving";
  else percussion = "out";

  return {
    cello: motionFrom(signal.stockTrend),
    guitar: motionFrom(signal.bondTrend),
    bass: motionFrom(signal.goldTrend),
    percussion,
  };
}

function holdField<K extends keyof MusicalState>(
  field: K,
  desired: MusicalState,
  current: MusicalState,
  dwell: Dwell,
): MusicalState[K] {
  const locked = dwell[field as keyof Dwell] > 0 && desired[field] !== current[field];
  return locked ? current[field] : desired[field];
}

export function queueState(desired: MusicalState, current: MusicalState, dwell: Dwell): MusicalState {
  return {
    cello: holdField("cello", desired, current, dwell),
    guitar: holdField("guitar", desired, current, dwell),
    bass: holdField("bass", desired, current, dwell),
    percussion: holdField("percussion", desired, current, dwell),
  };
}

export function landPhrase(
  queued: MusicalState,
  current: MusicalState,
  dwell: Dwell,
): { current: MusicalState; dwell: Dwell } {
  return {
    current: queued,
    dwell: {
      cello: queued.cello !== current.cello ? 1 : Math.max(0, dwell.cello - 1),
      guitar: queued.guitar !== current.guitar ? 1 : Math.max(0, dwell.guitar - 1),
      bass: queued.bass !== current.bass ? 1 : Math.max(0, dwell.bass - 1),
      percussion: queued.percussion !== current.percussion ? 1 : Math.max(0, dwell.percussion - 1),
    },
  };
}

function partLabel(name: string, motion: PartMotion): string | null {
  if (motion === "home") return null;
  return `${name} ${motion}`;
}

export function describeState(state: MusicalState): string {
  const parts = [
    partLabel("Cello", state.cello),
    partLabel("Guitar", state.guitar),
    partLabel("Bass", state.bass),
    state.percussion === "in" ? "storm" : state.percussion === "resolving" ? "storm resolving" : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : "Bed";
}

export function markerLabel(previous: MusicalState, next: MusicalState): string | null {
  const parts: string[] = [];
  for (const [name, key] of [
    ["cello", "cello"],
    ["guitar", "guitar"],
    ["bass", "bass"],
  ] as const) {
    if (previous[key] !== next[key]) {
      parts.push(next[key] === "home" ? `${name} returns` : `${name} ${next[key]}`);
    }
  }
  if (previous.percussion !== next.percussion) {
    if (next.percussion === "in") parts.push("percussion enters");
    else if (next.percussion === "resolving") parts.push("storm resolving");
    else if (previous.percussion !== "out") parts.push("percussion leaves");
  }
  return parts.length > 0 ? parts.join(", ") : null;
}

export function sameState(a: MusicalState, b: MusicalState): boolean {
  return (
    a.cello === b.cello && a.guitar === b.guitar && a.bass === b.bass && a.percussion === b.percussion
  );
}

export { HOME_STATE, OPEN_DWELL };
