import { describe, expect, it } from "vitest";
import { defaultSettings } from "../market/types";
import { applyThrough, initialMemory, sessionArrangement, walkConditions } from "../playback";
import { presetById } from "../composition/types";
import { buildScenario } from "./scenario";

function runs(flags: boolean[]): number[] {
  const lengths: number[] = [];
  let current = 0;
  for (const flag of flags) {
    if (flag) current += 1;
    else if (current > 0) {
      lengths.push(current);
      current = 0;
    }
  }
  if (current > 0) lengths.push(current);
  return lengths;
}

describe("scenario", () => {
  const scenario = buildScenario();
  const settings = defaultSettings;

  it("starts calm on all directional parts", () => {
    const played = walkConditions(scenario.bars, scenario.playFrom, scenario.playTo - 1, settings);
    expect(played[0]).toMatchObject({
      stockTrend: "resting",
      bondTrend: "resting",
      goldTrend: "resting",
      volatility: "calm",
    });
    expect(scenario.bars.at(-1)?.date).toBe("2026-10-28");
  });

  it("contains stock rise and fall, bond fall, gold rise, and a long storm", () => {
    const played = walkConditions(scenario.bars, scenario.playFrom, scenario.playTo - 1, settings);
    const stockUp = played.map((sample) => sample.stockTrend === "rising");
    const stockDown = played.map((sample) => sample.stockTrend === "falling");
    const bondDown = played.map((sample) => sample.bondTrend === "falling");
    const goldUp = played.map((sample) => sample.goldTrend === "rising");
    const vol = played.map((sample) => sample.volatility === "elevated");
    expect(Math.max(...runs(stockUp))).toBeGreaterThanOrEqual(30);
    expect(Math.max(...runs(stockDown))).toBeGreaterThanOrEqual(30);
    expect(Math.max(...runs(bondDown))).toBeGreaterThanOrEqual(30);
    expect(Math.max(...runs(goldUp))).toBeGreaterThanOrEqual(25);
    expect(Math.max(...runs(vol))).toBeGreaterThanOrEqual(35);
    expect(Math.min(...runs(vol))).toBe(1);
    expect(played.at(-1)?.stockTrend).toBe("resting");
    expect(played.at(-1)?.volatility).toBe("calm");
  });

  it("lets balanced ignore the poke and keep the storm", () => {
    let memory = initialMemory(scenario, settings);
    const persistence = presetById("balanced").persistenceMs;
    let pokeCommitted = false;
    let stormCommitted = false;
    for (let index = scenario.playFrom; index < scenario.playTo; index += 1) {
      memory = applyThrough(memory, scenario, index, settings, persistence);
      if (index === scenario.pokeIndex && memory.committed.volatility === "elevated") pokeCommitted = true;
      if (index === scenario.stormStart + 20 && memory.committed.volatility === "elevated") stormCommitted = true;
    }
    expect(pokeCommitted).toBe(false);
    expect(stormCommitted).toBe(true);
    expect(memory.committed.stockTrend).not.toBe("rising");
  });

  it("lets reactive catch the poke and patient wait for the storm", () => {
    let reactive = initialMemory(scenario, settings);
    reactive = applyThrough(reactive, scenario, scenario.pokeIndex, settings, 0);
    expect(reactive.committed.volatility).toBe("elevated");

    let patient = initialMemory(scenario, settings);
    const wait = presetById("patient").persistenceMs;
    patient = applyThrough(patient, scenario, scenario.stormStart + 10, settings, wait);
    expect(patient.committed.volatility).toBe("calm");
    patient = applyThrough(patient, scenario, scenario.stormEnd - 1, settings, wait);
    expect(patient.committed.volatility).toBe("elevated");
  });

  it("summarizes the session with directional motion", () => {
    const mood = sessionArrangement(scenario, settings, false);
    expect(["rising", "falling", "home"]).toContain(mood.cello);
    expect(["rising", "falling", "home"]).toContain(mood.guitar);
    expect(["rising", "falling", "home"]).toContain(mood.bass);
  });
});
