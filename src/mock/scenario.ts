import { closeForGap } from "../market/math";
import type { Bar } from "../market/types";

export const SAMPLE_SEC = 15;
const PRELUDE = 220;

export type Segment = {
  start: number;
  end: number;
  label: string;
};

export type Scenario = {
  bars: Bar[];
  playFrom: number;
  playTo: number;
  sampleSec: number;
  segments: Segment[];
  pokeIndex: number;
  riseStart: number;
  riseEnd: number;
  bondFallStart: number;
  bondFallEnd: number;
  goldRiseStart: number;
  goldRiseEnd: number;
  stockFallStart: number;
  stockFallEnd: number;
  stormStart: number;
  stormEnd: number;
};

function businessDaysEnding(endIso: string, count: number): string[] {
  const [year, month, day] = endIso.split("-").map(Number);
  const cursor = new Date(Date.UTC(year, month - 1, day));
  const dates: string[] = [];
  while (dates.length < count) {
    const weekday = cursor.getUTCDay();
    if (weekday !== 0 && weekday !== 6) {
      dates.push(cursor.toISOString().slice(0, 10));
    }
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return dates.reverse();
}

function pushClose(series: number[], window: number, targetGap: number) {
  series.push(closeForGap(series, window, targetGap));
}

export function buildScenario(): Scenario {
  const playFrom = PRELUDE;
  const pokeIndex = playFrom + 4;
  const riseStart = pokeIndex + 5;
  const riseEnd = riseStart + 40;
  const bondFallStart = riseStart + 10;
  const bondFallEnd = bondFallStart + 36;
  const goldRiseStart = riseStart + 18;
  const goldRiseEnd = goldRiseStart + 32;
  const stormStart = riseStart + 12;
  const stormEnd = stormStart + 48;
  const stockFallStart = riseEnd + 4;
  const stockFallEnd = stockFallStart + 36;
  const fadeEnd = Math.max(stockFallEnd, stormEnd, bondFallEnd, goldRiseEnd) + 16;
  const total = fadeEnd;
  const dates = businessDaysEnding("2026-10-28", total);

  const spy: number[] = [];
  const tlt: number[] = [];
  const gld: number[] = [];
  const vix: number[] = [];

  for (let i = 0; i < total; i += 1) {
    const inStockRise = i >= riseStart && i < riseEnd;
    const inStockFall = i >= stockFallStart && i < stockFallEnd;
    const inBondFall = i >= bondFallStart && i < bondFallEnd;
    const inGoldRise = i >= goldRiseStart && i < goldRiseEnd;
    const inPoke = i === pokeIndex;
    const inStorm = i >= stormStart && i < stormEnd;

    if (spy.length < 30) {
      spy.push(560 * (1 + 0.006 * Math.sin(i / 3)));
    } else if (inStockRise) {
      pushClose(spy, 30, 0.014 + 0.003 * Math.sin(i / 2.4));
    } else if (inStockFall) {
      pushClose(spy, 30, -0.014 + 0.003 * Math.sin(i / 2.4));
    } else {
      pushClose(spy, 30, 0);
    }

    if (tlt.length < 30) {
      tlt.push(92 * (1 + 0.004 * Math.cos(i / 4)));
    } else if (inBondFall) {
      pushClose(tlt, 30, -0.014 + 0.002 * Math.cos(i / 2.1));
    } else {
      pushClose(tlt, 30, 0);
    }

    if (gld.length < 50) {
      gld.push(310 * (1 + 0.0015 * Math.sin(i / 7)));
    } else if (inGoldRise) {
      pushClose(gld, 50, 0.014 + 0.002 * Math.sin(i / 3));
    } else {
      pushClose(gld, 50, 0);
    }

    if (vix.length < 20) {
      vix.push(16 * (1 + 0.02 * Math.sin(i / 4)));
    } else if (inPoke) {
      pushClose(vix, 20, 0.25);
    } else if (inStorm) {
      pushClose(vix, 20, i === stormStart ? 0.2 : 0.08);
    } else {
      pushClose(vix, 20, 0);
    }
  }

  const bars: Bar[] = dates.map((date, i) => ({
    date,
    spy: spy[i],
    tlt: tlt[i],
    gld: gld[i],
    vix: vix[i],
  }));

  const segments: Segment[] = [
    { start: playFrom, end: pokeIndex, label: "Quiet open" },
    { start: pokeIndex, end: pokeIndex + 1, label: "Volatility poke" },
    { start: pokeIndex + 1, end: riseStart, label: "Quiet again" },
    { start: riseStart, end: bondFallStart, label: "Stocks rise" },
    { start: bondFallStart, end: goldRiseStart, label: "Stocks rise, bonds fall" },
    { start: goldRiseStart, end: riseEnd, label: "Stocks rise, bonds fall, gold rises" },
    { start: riseEnd, end: stockFallStart, label: "Stocks rest, storm may hold" },
    { start: stockFallStart, end: stockFallEnd, label: "Stocks fall" },
    { start: stockFallEnd, end: fadeEnd, label: "Return toward bed" },
  ];

  return {
    bars,
    playFrom,
    playTo: fadeEnd,
    sampleSec: SAMPLE_SEC,
    segments,
    pokeIndex,
    riseStart,
    riseEnd,
    bondFallStart,
    bondFallEnd,
    goldRiseStart,
    goldRiseEnd,
    stockFallStart,
    stockFallEnd,
    stormStart,
    stormEnd,
  };
}

export function segmentAt(scenario: Scenario, index: number): string {
  const match = [...scenario.segments].reverse().find((segment) => index >= segment.start && index < segment.end);
  return match?.label ?? "Scenario";
}

let cached: Scenario | null = null;

export function scenario(): Scenario {
  cached ??= buildScenario();
  return cached;
}
