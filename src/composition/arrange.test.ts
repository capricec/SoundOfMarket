import { describe, expect, it } from "vitest";
import { CALM_CONDITIONS } from "../market/types";
import { desiredState, landPhrase, queueState } from "./arrange";
import { commitConditions } from "./persist";
import { HOME_STATE, OPEN_DWELL } from "./types";

describe("arrangement", () => {
  it("maps each asset direction onto its part", () => {
    const next = desiredState(
      {
        ...CALM_CONDITIONS,
        stockTrend: "rising",
        bondTrend: "falling",
        goldTrend: "rising",
        volatility: "elevated",
      },
      HOME_STATE,
      false,
    );
    expect(next).toEqual({
      cello: "rising",
      guitar: "falling",
      bass: "rising",
      percussion: "in",
    });
  });

  it("holds percussion while volatility stays elevated", () => {
    const rising = { ...CALM_CONDITIONS, volatility: "elevated" as const };
    const first = desiredState(rising, HOME_STATE, true);
    expect(first.percussion).toBe("in");
    const held = desiredState(rising, first, true);
    expect(held.percussion).toBe("in");
  });

  it("resolves once on the way out when that stem exists", () => {
    const storm = desiredState({ ...CALM_CONDITIONS, volatility: "elevated" }, HOME_STATE, true);
    const leaving = desiredState(CALM_CONDITIONS, storm, true);
    expect(leaving.percussion).toBe("resolving");
    const gone = desiredState(CALM_CONDITIONS, leaving, true);
    expect(gone.percussion).toBe("out");
  });

  it("blocks a reversal for one phrase after a change", () => {
    const rising = desiredState({ ...CALM_CONDITIONS, stockTrend: "rising" }, HOME_STATE, false);
    const landed = landPhrase(rising, HOME_STATE, OPEN_DWELL);
    expect(landed.current.cello).toBe("rising");
    const reversed = desiredState({ ...CALM_CONDITIONS, stockTrend: "falling" }, landed.current, false);
    const held = queueState(reversed, landed.current, landed.dwell);
    expect(held.cello).toBe("rising");
    const released = landPhrase(held, landed.current, landed.dwell);
    const after = queueState(reversed, released.current, released.dwell);
    expect(after.cello).toBe("falling");
  });

  it("does not commit a condition that fails to persist", () => {
    const raw = { ...CALM_CONDITIONS, volatility: "elevated" as const };
    const early = commitConditions(raw, CALM_CONDITIONS, {}, 0, 120_000);
    expect(early.committed.volatility).toBe("calm");
    const later = commitConditions(raw, early.committed, early.pending, 120_000, 120_000);
    expect(later.committed.volatility).toBe("elevated");
  });
});
