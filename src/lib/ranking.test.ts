import { describe, expect, it } from "vitest";
import { computeDifferentials, rankMatches } from "./ranking";
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

describe("computeDifferentials", () => {
  it("computes home/away/overall diff from goals and xG", () => {
    const r = computeDifferentials(
      match({ homeScore: 3, awayScore: 0, homeXG: 1.2, awayXG: 1.5, xgAvailable: true }),
    );
    expect(r.homeDiff).toBeCloseTo(1.8);
    expect(r.awayDiff).toBeCloseTo(-1.5);
    expect(r.overallDiff).toBeCloseTo(3.3);
  });

  it("never fabricates a differential when xG is missing", () => {
    const r = computeDifferentials(match({ homeScore: 2, awayScore: 1, xgAvailable: false }));
    expect(r.homeDiff).toBeNull();
    expect(r.awayDiff).toBeNull();
    expect(r.overallDiff).toBeNull();
  });
});

describe("rankMatches", () => {
  it("sorts by overallDiff desc, then xG spread desc, then minute desc", () => {
    const a = match({ providerMatchId: "a", homeScore: 3, awayScore: 0, homeXG: 1, awayXG: 1, xgAvailable: true }); // overall 3
    const b = match({ providerMatchId: "b", homeScore: 1, awayScore: 1, homeXG: 1, awayXG: 1, xgAvailable: true }); // overall 0
    const c = match({ providerMatchId: "c", homeScore: 2, awayScore: 0, homeXG: 0.5, awayXG: 1.5, xgAvailable: true }); // overall 3, spread 1
    const ranked = rankMatches([a, b, c]);
    // a and c both overall 3; c has larger xG spread → c first.
    expect(ranked[0].providerMatchId).toBe("c");
    expect(ranked[1].providerMatchId).toBe("a");
    expect(ranked[2].providerMatchId).toBe("b");
  });

  it("places matches without xG last", () => {
    const withXg = match({ providerMatchId: "x", homeScore: 1, awayScore: 0, homeXG: 0.2, awayXG: 0.3, xgAvailable: true });
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
