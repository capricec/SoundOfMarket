import { analyzeAt } from "./market/analyze";
import {
  CALM_CONDITIONS,
  type Bar,
  type Conditions,
  type SignalFrame,
  type SignalSettings,
} from "./market/types";
import { desiredState, landPhrase, markerLabel, queueState } from "./composition/arrange";
import { commitConditions, majorityMood, type Pending } from "./composition/persist";
import { HOME_STATE, OPEN_DWELL, type Dwell, type MusicalState } from "./composition/types";
import type { Scenario } from "./mock/scenario";

export type Marker = { date: string; label: string };

export type Memory = {
  schmitt: Conditions;
  raw: Conditions;
  committed: Conditions;
  pending: Pending;
  musical: MusicalState;
  dwell: Dwell;
  lastIndex: number;
  markers: Marker[];
  frame: SignalFrame | null;
};

export function conditionsOf(frame: Pick<SignalFrame, keyof Conditions>): Conditions {
  return {
    stockTrend: frame.stockTrend,
    bondTrend: frame.bondTrend,
    goldTrend: frame.goldTrend,
    relationship: frame.relationship,
    volatility: frame.volatility,
  };
}

export function walkConditions(
  bars: Bar[],
  from: number,
  to: number,
  settings: SignalSettings,
  seed: Conditions = CALM_CONDITIONS,
): Conditions[] {
  const out: Conditions[] = [];
  let previous = seed;
  for (let index = from; index <= to; index += 1) {
    const frame = analyzeAt(bars, index, settings, previous);
    previous = conditionsOf(frame);
    out.push(previous);
  }
  return out;
}

export function initialMemory(scenario: Scenario, settings: SignalSettings): Memory {
  const walked = walkConditions(scenario.bars, 0, scenario.playFrom - 1, settings);
  const schmitt = walked[walked.length - 1] ?? CALM_CONDITIONS;
  return {
    schmitt,
    raw: schmitt,
    committed: schmitt,
    pending: {},
    musical: HOME_STATE,
    dwell: OPEN_DWELL,
    lastIndex: scenario.playFrom - 1,
    markers: [],
    frame: null,
  };
}

export function applyThrough(
  memory: Memory,
  scenario: Scenario,
  targetIndex: number,
  settings: SignalSettings,
  persistenceMs: number,
): Memory {
  const clamped = Math.max(scenario.playFrom, Math.min(targetIndex, scenario.playTo - 1));
  let schmitt = memory.schmitt;
  let committed = memory.committed;
  let pending = memory.pending;
  let frame = memory.frame;
  let raw = memory.raw;
  const start = Math.max(memory.lastIndex + 1, scenario.playFrom);
  for (let index = start; index <= clamped; index += 1) {
    frame = analyzeAt(scenario.bars, index, settings, schmitt);
    raw = conditionsOf(frame);
    schmitt = raw;
    const nowMs = (index - scenario.playFrom) * scenario.sampleSec * 1000;
    const gated = commitConditions(raw, committed, pending, nowMs, persistenceMs);
    committed = gated.committed;
    pending = gated.pending;
  }
  if (clamped < start) {
    frame = analyzeAt(scenario.bars, clamped, settings, schmitt);
    raw = conditionsOf(frame);
  }
  return {
    ...memory,
    schmitt,
    raw,
    committed,
    pending,
    lastIndex: clamped,
    frame,
  };
}

export function queuedMusic(memory: Memory, hasResolveStem: boolean, frozen: MusicalState | null): MusicalState {
  if (frozen) return frozen;
  if (!memory.frame) return memory.musical;
  const desired = desiredState(memory.committed, memory.musical, hasResolveStem);
  return queueState(desired, memory.musical, memory.dwell);
}

export function onPhrase(memory: Memory, queued: MusicalState, date: string): Memory {
  const previous = memory.musical;
  const landed = landPhrase(queued, previous, memory.dwell);
  const label = markerLabel(previous, landed.current);
  return {
    ...memory,
    musical: landed.current,
    dwell: landed.dwell,
    markers: label ? [...memory.markers, { date, label }] : memory.markers,
  };
}

export function sessionArrangement(scenario: Scenario, settings: SignalSettings, hasResolveStem: boolean): MusicalState {
  const samples = walkConditions(scenario.bars, scenario.playFrom, scenario.playTo - 1, settings);
  return desiredState(majorityMood(samples), HOME_STATE, hasResolveStem);
}

export function indexAt(scenario: Scenario, elapsedSec: number): number {
  const steps = Math.floor(elapsedSec / scenario.sampleSec);
  return Math.min(scenario.playFrom + steps, scenario.playTo - 1);
}

export function scenarioDuration(scenario: Scenario): number {
  return (scenario.playTo - scenario.playFrom) * scenario.sampleSec;
}

export function applyOverrides(conditions: Conditions, overrides: Partial<Conditions>): Conditions {
  return { ...conditions, ...overrides };
}

export function applyLive(
  memory: Memory,
  frame: SignalFrame,
  nowMs: number,
  persistenceMs: number,
  holdMusic: boolean,
): Memory {
  const raw = conditionsOf(frame);
  if (holdMusic) {
    return { ...memory, raw, frame, schmitt: raw };
  }
  const gated = commitConditions(raw, memory.committed, memory.pending, nowMs, persistenceMs);
  return {
    ...memory,
    schmitt: raw,
    raw,
    committed: gated.committed,
    pending: gated.pending,
    frame,
  };
}
