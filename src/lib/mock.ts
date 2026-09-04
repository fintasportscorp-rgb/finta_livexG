// ---------------------------------------------------------------------------
// A single synthetic match for visualizing the UI when nothing is live.
// It is clearly flagged `demo: true` so it can never be mistaken for real data.
// Values chosen to show the two metrics diverging:
//   - home OVER-performs (2 goals on 0.80 xG → +1.20, green)
//   - away is heavily OWED (0 goals on 2.40 xG → -2.40, red + pulsing)
//   - NET xG − goals = 3.20 − 2 = +1.20 (qualifies, ≥ 1.1)
//   - Per-team OWED = 2.40 (away only) — the filter shows the difference
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
    awayScore: 0,
    homeXG: 0.8,
    awayXG: 2.4,
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
