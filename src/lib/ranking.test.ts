import { describe, expect, it } from "vitest";
import { computeDifferentials, rankMatches, remainingMinutes } from "./ranking";
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
    expect(remainingMinutes("live", 95)).toBe(0);
    expect(remainingMinutes("halftime", null)).toBe(45);
    expect(remainingMinutes("finished", 90)).toBe(0);
    expect(remainingMinutes("live", null)).toBeNull();
  });
});

describe("computeDifferentials", () => {
  it("computes per-team diffs and goals owed from xG created but not scored", () => {
    // home: 0 goals on 1.5 xG → owes 1.5; away: 2 goals on 0.4 xG → owes 0
    const r = computeDifferentials(
      match({ homeScore: 0, awayScore: 2, homeXG: 1.5, awayXG: 0.4, xgAvailable: true, matchMinute: 45 }),
    );
    expect(r.homeDiff).toBeCloseTo(-1.5);
    expect(r.awayDiff).toBeCloseTo(1.6);
    expect(r.goalsOwed).toBeCloseTo(1.5);
    expect(r.remainingMinutes).toBe(45);
    expect(r.rankScore).not.toBeNull();
  });

  it("never fabricates a signal when xG is missing", () => {
    const r = computeDifferentials(match({ homeScore: 2, awayScore: 1, xgAvailable: false }));
    expect(r.goalsOwed).toBeNull();
    expect(r.rankScore).toBeNull();
    expect(r.homeDiff).toBeNull();
  });
});

describe("rankMatches", () => {
  it("ranks the match with more goals owed higher", () => {
    const low = match({ providerMatchId: "low", homeScore: 1, awayScore: 1, homeXG: 1.1, awayXG: 1.0, xgAvailable: true, matchMinute: 45 });
    const high = match({ providerMatchId: "high", homeScore: 0, awayScore: 0, homeXG: 2.0, awayXG: 1.0, xgAvailable: true, matchMinute: 45 });
    const ranked = rankMatches([low, high]);
    expect(ranked[0].providerMatchId).toBe("high");
  });

  it("with equal goals owed, more remaining time ranks higher", () => {
    const early = match({ providerMatchId: "early", homeScore: 0, awayScore: 0, homeXG: 1.5, awayXG: 0, xgAvailable: true, matchMinute: 20 });
    const late = match({ providerMatchId: "late", homeScore: 0, awayScore: 0, homeXG: 1.5, awayXG: 0, xgAvailable: true, matchMinute: 85 });
    const ranked = rankMatches([late, early]);
    expect(ranked[0].providerMatchId).toBe("early");
  });

  it("ranks over-performing (no goals owed) matches below owed ones", () => {
    const over = match({ providerMatchId: "over", homeScore: 3, awayScore: 0, homeXG: 1.0, awayXG: 0.5, xgAvailable: true, matchMinute: 60 });
    const owed = match({ providerMatchId: "owed", homeScore: 0, awayScore: 0, homeXG: 1.2, awayXG: 0.3, xgAvailable: true, matchMinute: 60 });
    const ranked = rankMatches([over, owed]);
    expect(ranked[0].providerMatchId).toBe("owed");
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
