// ---------------------------------------------------------------------------
// A single synthetic match for visualizing the UI when nothing is live.
// It is clearly flagged `demo: true` so it can never be mistaken for real data.
// Values are chosen to exercise every metric state:
//   - home OVER-performs (2 goals on 1.14 xG → +0.86, green)
//   - away UNDER-performs (1 goal on 1.72 xG → -0.72, red)
//   - match total goals 3 vs total xG 2.86 → +0.14 (near-neutral)
// ---------------------------------------------------------------------------

import type { NormalizedMatch } from "./types";

export function mockMatch(): NormalizedMatch {
  const now = new Date().toISOString();
  return {
    provider: "fotmob",
    providerMatchId: "demo-1",
    homeTeam: "Arsenal",
    awayTeam: "Chelsea",
    homeScore: 2,
    awayScore: 1,
    homeXG: 1.14,
    awayXG: 1.72,
    xgAvailable: true,
    matchMinute: 67,
    status: "live",
    competition: "Premier League",
    kickoff: now,
    lastUpdated: now,
    sourceProvider: "fotmob",
    sourceMatchId: "demo-1",
    sourceLastUpdated: now,
    sourceUrl: "https://www.fotmob.com/",
    demo: true,
  };
}
