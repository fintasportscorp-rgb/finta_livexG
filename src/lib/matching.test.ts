import { describe, expect, it } from "vitest";
import { findBestMatch, matchConfidence, normalizeTeamName } from "./matching";
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

describe("normalizeTeamName", () => {
  it("strips diacritics, suffixes and punctuation", () => {
    expect(normalizeTeamName("Atlético Madrid CF")).toBe("atleticomadrid");
    expect(normalizeTeamName("Manchester United FC")).toBe("manchesterunited");
  });
});

describe("matchConfidence", () => {
  it("scores identical fixtures highly", () => {
    const kickoff = "2026-09-02T18:00:00Z";
    const a = match({ homeTeam: "Arsenal FC", awayTeam: "Chelsea FC", kickoff, competition: "Premier League" });
    const b = match({
      provider: "sportmonks",
      homeTeam: "Arsenal",
      awayTeam: "Chelsea",
      kickoff,
      competition: "Premier League",
    });
    expect(matchConfidence(a, b).score).toBeGreaterThan(0.8);
  });

  it("scores different fixtures low", () => {
    const a = match({ homeTeam: "Arsenal", awayTeam: "Chelsea" });
    const b = match({ provider: "sportmonks", homeTeam: "Bayern", awayTeam: "Dortmund" });
    expect(matchConfidence(a, b).score).toBeLessThan(0.8);
  });
});

describe("findBestMatch", () => {
  it("returns null when nothing clears the threshold", () => {
    const target = match({ homeTeam: "Arsenal", awayTeam: "Chelsea" });
    const pool = [match({ homeTeam: "Bayern", awayTeam: "Dortmund" })];
    expect(findBestMatch(target, pool)).toBeNull();
  });

  it("finds the high-confidence candidate", () => {
    const kickoff = "2026-09-02T18:00:00Z";
    const target = match({ homeTeam: "Arsenal FC", awayTeam: "Chelsea FC", kickoff });
    const pool = [
      match({ providerMatchId: "wrong", homeTeam: "Bayern", awayTeam: "Dortmund" }),
      match({ providerMatchId: "right", homeTeam: "Arsenal", awayTeam: "Chelsea", kickoff }),
    ];
    const best = findBestMatch(target, pool);
    expect(best?.match.providerMatchId).toBe("right");
  });
});
