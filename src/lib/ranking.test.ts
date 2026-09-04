import { describe, expect, it } from "vitest";
import { computeDifferentials, rankMatches, remainingMinutes, sortByMetric } from "./ranking";
import type { NormalizedMatch } from "./types";

function match(partial: Partial<NormalizedMatch>): NormalizedMatch {
  const now = new Date().toISOString();
  return {
    provider: "fotmob",
    providerMatchId: "1",
    homeTeam: "Home",
    awayTeam: "Away",
    homeScore: 0,
    awayScore: 0,
    homeXG: null,
    awayXG: null,
    xgAvailable: false,
    matchMinute: null,
    status: "live",
    lastUpdated: now,
    sourceProvider: "fotmob",
    sourceMatchId: "1",
    sourceLastUpdated: now,
    sourceUrl: "",
    ...partial,
  };
}

describe("remainingMinutes", () => {
  it("estimates regulation time left for live matches", () => {
    expect(remainingMinutes("live", 20)).toBe(70);
    expect(remainingMinutes("live", 85)).toBe(5);
    expect(remainingMinutes("halftime", null)).toBe(45);
    expect(remainingMinutes("live", null)).toBeNull();
  });
});

describe("computeDifferentials", () => {
  it("computes net xG (total xG - total goals) and per-team owed", () => {
    // Aalesund 2-0 with xG 1.11/0.75: net = 1.86 - 2 = -0.14; owed = 0.75.
    const r = computeDifferentials(
      match({ homeScore: 2, awayScore: 0, homeXG: 1.11, awayXG: 0.75, xgAvailable: true, matchMinute: 46 }),
    );
    expect(r.netXg).toBeCloseTo(-0.14);
    expect(r.goalsOwed).toBeCloseTo(0.75);
    expect(r.homeDiff).toBeCloseTo(0.89);
    expect(r.awayDiff).toBeCloseTo(-0.75);
  });

  it("net offsets an over-performing team against an under-performing one", () => {
    // home 2 goals on 0.8 xG (+1.2), away 0 on 2.4 (owes 2.4):
    // net = 3.2 - 2 = 1.2 ; owed = 2.4
    const r = computeDifferentials(
      match({ homeScore: 2, awayScore: 0, homeXG: 0.8, awayXG: 2.4, xgAvailable: true, matchMinute: 60 }),
    );
    expect(r.netXg).toBeCloseTo(1.2);
    expect(r.goalsOwed).toBeCloseTo(2.4);
  });

  it("never fabricates a signal when xG is missing", () => {
    const r = computeDifferentials(match({ homeScore: 2, awayScore: 1, xgAvailable: false }));
    expect(r.netXg).toBeNull();
    expect(r.goalsOwed).toBeNull();
    expect(r.rankScore).toBeNull();
  });
});

describe("rankMatches (net, default)", () => {
  it("ranks the match with the higher net xG deficit first", () => {
    const low = match({ providerMatchId: "low", homeScore: 1, awayScore: 1, homeXG: 1.1, awayXG: 1.0, xgAvailable: true, matchMinute: 45 });
    const high = match({ providerMatchId: "high", homeScore: 0, awayScore: 0, homeXG: 2.0, awayXG: 1.0, xgAvailable: true, matchMinute: 45 });
    const ranked = rankMatches([low, high]);
    expect(ranked[0].providerMatchId).toBe("high");
  });

  it("ranks an over-scored match (negative net) below an owed one", () => {
    const over = match({ providerMatchId: "over", homeScore: 3, awayScore: 0, homeXG: 1.0, awayXG: 0.5, xgAvailable: true, matchMinute: 60 });
    const owed = match({ providerMatchId: "owed", homeScore: 0, awayScore: 0, homeXG: 1.2, awayXG: 0.6, xgAvailable: true, matchMinute: 60 });
    const ranked = rankMatches([over, owed]);
    expect(ranked[0].providerMatchId).toBe("owed");
  });

  it("with equal net, more remaining time ranks higher", () => {
    const early = match({ providerMatchId: "early", homeScore: 0, awayScore: 0, homeXG: 1.5, awayXG: 0, xgAvailable: true, matchMinute: 20 });
    const late = match({ providerMatchId: "late", homeScore: 0, awayScore: 0, homeXG: 1.5, awayXG: 0, xgAvailable: true, matchMinute: 85 });
    const ranked = rankMatches([late, early]);
    expect(ranked[0].providerMatchId).toBe("early");
  });

  it("places matches without xG last", () => {
    const withXg = match({ providerMatchId: "x", homeScore: 0, awayScore: 0, homeXG: 1.0, awayXG: 0.3, xgAvailable: true, matchMinute: 30 });
    const noXg = match({ providerMatchId: "n", xgAvailable: false, matchMinute: 90 });
    const ranked = rankMatches([noXg, withXg]);
    expect(ranked[0].providerMatchId).toBe("x");
    expect(ranked[1].providerMatchId).toBe("n");
  });

  it("does not mutate the input array", () => {
    const arr = [match({ providerMatchId: "1" }), match({ providerMatchId: "2" })];
    const snapshot = arr.map((m) => m.providerMatchId);
    rankMatches(arr);
    expect(arr.map((m) => m.providerMatchId)).toEqual(snapshot);
  });
});

describe("sortByMetric (owed filter)", () => {
  it("re-orders by per-team owed instead of net", () => {
    // A: net 1.2, owed 2.4 (home over-performs). B: net 1.3, owed 1.3.
    const a = rankMatches([
      match({ providerMatchId: "A", homeScore: 2, awayScore: 0, homeXG: 0.8, awayXG: 2.4, xgAvailable: true, matchMinute: 60 }),
      match({ providerMatchId: "B", homeScore: 0, awayScore: 0, homeXG: 0.8, awayXG: 0.5, xgAvailable: true, matchMinute: 60 }),
    ]);
    // By net, B (1.3) outranks A (1.2). By owed, A (2.4) outranks B (1.3).
    expect(a[0].providerMatchId).toBe("B");
    const byOwed = sortByMetric(a, "owed");
    expect(byOwed[0].providerMatchId).toBe("A");
  });
});
