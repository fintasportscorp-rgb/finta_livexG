// ---------------------------------------------------------------------------
// Ranking. This math is IDENTICAL regardless of which provider supplied the
// data. It operates purely on the NormalizedMatch model.
//
//   homeDiff = homeGoals - homeXG
//   awayDiff = awayGoals - awayXG
//   overallDiff = abs(homeDiff) + abs(awayDiff)
//
// Sort: overallDiff DESC, then abs(homeXG - awayXG) DESC, then matchMinute DESC.
// Matches without xG cannot produce a differential and are ranked last.
// ---------------------------------------------------------------------------

import type { NormalizedMatch, RankedMatch } from "./types";

export function computeDifferentials(match: NormalizedMatch): RankedMatch {
  if (!match.xgAvailable || match.homeXG === null || match.awayXG === null) {
    // Missing xG never yields a fabricated differential.
    return { ...match, homeDiff: null, awayDiff: null, overallDiff: null };
  }

  const homeDiff = match.homeScore - match.homeXG;
  const awayDiff = match.awayScore - match.awayXG;
  const overallDiff = Math.abs(homeDiff) + Math.abs(awayDiff);

  return { ...match, homeDiff, awayDiff, overallDiff };
}

function xgSpread(m: RankedMatch): number {
  if (m.homeXG === null || m.awayXG === null) return -1;
  return Math.abs(m.homeXG - m.awayXG);
}

/**
 * Rank matches. Returns a NEW sorted array (input is not mutated). Matches with
 * a computable overallDiff always sort ahead of those without.
 */
export function rankMatches(matches: NormalizedMatch[]): RankedMatch[] {
  const ranked = matches.map(computeDifferentials);

  return [...ranked].sort((a, b) => {
    const aHas = a.overallDiff !== null;
    const bHas = b.overallDiff !== null;
    if (aHas !== bHas) return aHas ? -1 : 1;

    if (aHas && bHas) {
      if (b.overallDiff! !== a.overallDiff!) return b.overallDiff! - a.overallDiff!;
      const spread = xgSpread(b) - xgSpread(a);
      if (spread !== 0) return spread;
    }

    const aMin = a.matchMinute ?? -1;
    const bMin = b.matchMinute ?? -1;
    return bMin - aMin;
  });
}
