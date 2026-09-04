import { beforeEach, describe, expect, it } from "vitest";
import { shouldAlert, __resetAlertStateForTests } from "./engine";
import type { RankedMatch } from "../types";

function ranked(partial: Partial<RankedMatch>): RankedMatch {
  const now = new Date().toISOString();
  return {
    provider: "fotmob",
    providerMatchId: "1",
    homeTeam: "Home",
    awayTeam: "Away",
    homeScore: 0,
    awayScore: 0,
    homeXG: 1.5,
    awayXG: 0,
    xgAvailable: true,
    matchMinute: 40,
    status: "live",
    lastUpdated: now,
    sourceProvider: "fotmob",
    sourceMatchId: "m1",
    sourceLastUpdated: now,
    sourceUrl: "",
    homeDiff: -1.5,
    awayDiff: 0,
    overallDiff: 1.5,
    goalsOwed: 1.5,
    remainingMinutes: 50,
    rankScore: 1,
    ...partial,
  };
}

const THRESHOLD = 1.1;

describe("shouldAlert", () => {
  beforeEach(() => __resetAlertStateForTests());

  it("alerts when a match first crosses the threshold", () => {
    expect(shouldAlert(ranked({ goalsOwed: 1.2 }), THRESHOLD)).toBe(true);
  });

  it("does not alert below the threshold", () => {
    expect(shouldAlert(ranked({ goalsOwed: 1.05 }), THRESHOLD)).toBe(false);
  });

  it("does not re-alert while it stays elevated (hysteresis)", () => {
    expect(shouldAlert(ranked({ goalsOwed: 1.2 }), THRESHOLD)).toBe(true);
    expect(shouldAlert(ranked({ goalsOwed: 1.2 }), THRESHOLD)).toBe(false);
    expect(shouldAlert(ranked({ goalsOwed: 1.15 }), THRESHOLD)).toBe(false);
  });

  it("re-arms after dropping below the clear band, then alerts again", () => {
    expect(shouldAlert(ranked({ goalsOwed: 1.3 }), THRESHOLD)).toBe(true);
    // drops below threshold - 0.3 = 0.8 → re-armed
    expect(shouldAlert(ranked({ goalsOwed: 0.5 }), THRESHOLD)).toBe(false);
    expect(shouldAlert(ranked({ goalsOwed: 1.3 }), THRESHOLD)).toBe(true);
  });

  it("never alerts on demo matches", () => {
    expect(shouldAlert(ranked({ goalsOwed: 2.0, demo: true }), THRESHOLD)).toBe(false);
  });

  it("does not alert when xG is unavailable", () => {
    expect(shouldAlert(ranked({ goalsOwed: null }), THRESHOLD)).toBe(false);
  });

  it("tracks matches independently by id", () => {
    expect(shouldAlert(ranked({ sourceMatchId: "a", goalsOwed: 1.2 }), THRESHOLD)).toBe(true);
    expect(shouldAlert(ranked({ sourceMatchId: "b", goalsOwed: 1.2 }), THRESHOLD)).toBe(true);
  });
});
