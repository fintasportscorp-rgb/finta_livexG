// ---------------------------------------------------------------------------
// Ranking. Provider-agnostic — operates purely on the NormalizedMatch model.
//
// Signal: a NEGATIVE per-team differential (goals - xG < 0) means a team has
// created more chances than it has converted, so a goal is "owed" and is more
// likely to arrive. We surface those matches.
//
//   homeDiff  = homeGoals - homeXG
//   awayDiff  = awayGoals - awayXG
//   goalsOwed = max(0, -homeDiff) + max(0, -awayDiff)   // xG not yet converted
//
// Remaining time matters: the same deficit with 40' left has far more runway to
// convert than with 5' left. We weight goalsOwed by remaining opportunity, so
// more time left ranks a match higher for an equal amount owed.
//
//   rankScore = goalsOwed * (MIN_WEIGHT + (1-MIN_WEIGHT) * remaining/REG_TIME)
//
// Sort: rankScore DESC, then goalsOwed DESC, then remainingMinutes DESC, then
// matchMinute DESC. Matches without xG can't produce a signal and rank last.
// ---------------------------------------------------------------------------

import type { MatchStatus, NormalizedMatch, RankedMatch } from "./types";

const REG_TIME = 90; // regulation minutes used for the remaining-time estimate
const MIN_WEIGHT = 0.25; // floor so late matches still count, just less

/** Estimated regulation minutes remaining, used for the time weighting. */
export function remainingMinutes(status: MatchStatus, minute: number | null): number | null {
  switch (status) {
    case "finished":
      return 0;
    case "halftime":
      return 45;
    case "scheduled":
      return REG_TIME;
    case "paused":
    case "unknown":
      return minute === null ? null : clamp(REG_TIME - minute, 0, REG_TIME);
    case "live":
      if (minute === null) return null;
      return clamp(REG_TIME - minute, 0, REG_TIME);
    default:
      return null;
  }
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function opportunityFactor(remaining: number | null): number {
  // Unknown remaining time → treat as mid-match.
  const frac = remaining === null ? 0.5 : clamp(remaining / REG_TIME, 0, 1);
  return MIN_WEIGHT + (1 - MIN_WEIGHT) * frac;
}

export function computeDifferentials(match: NormalizedMatch): RankedMatch {
  const remaining = remainingMinutes(match.status, match.matchMinute);

  if (!match.xgAvailable || match.homeXG === null || match.awayXG === null) {
    // Missing xG never yields a fabricated differential or ranking signal.
    return {
      ...match,
      homeDiff: null,
      awayDiff: null,
      overallDiff: null,
      goalsOwed: null,
      remainingMinutes: remaining,
      rankScore: null,
    };
  }

  const homeDiff = match.homeScore - match.homeXG;
  const awayDiff = match.awayScore - match.awayXG;
  const overallDiff = Math.abs(homeDiff) + Math.abs(awayDiff);
  const goalsOwed = Math.max(0, -homeDiff) + Math.max(0, -awayDiff);
  const rankScore = goalsOwed * opportunityFactor(remaining);

  return {
    ...match,
    homeDiff,
    awayDiff,
    overallDiff,
    goalsOwed,
    remainingMinutes: remaining,
    rankScore,
  };
}

/**
 * Rank matches. Returns a NEW sorted array (input is not mutated). Matches with
 * a computable rankScore always sort ahead of those without (no xG).
 */
export function rankMatches(matches: NormalizedMatch[]): RankedMatch[] {
  const ranked = matches.map(computeDifferentials);

  return [...ranked].sort((a, b) => {
    const aHas = a.rankScore !== null;
    const bHas = b.rankScore !== null;
    if (aHas !== bHas) return aHas ? -1 : 1;

    if (aHas && bHas) {
      if (b.rankScore! !== a.rankScore!) return b.rankScore! - a.rankScore!;
      if (b.goalsOwed! !== a.goalsOwed!) return b.goalsOwed! - a.goalsOwed!;
      const aRem = a.remainingMinutes ?? -1;
      const bRem = b.remainingMinutes ?? -1;
      if (bRem !== aRem) return bRem - aRem;
    }

    const aMin = a.matchMinute ?? -1;
    const bMin = b.matchMinute ?? -1;
    return bMin - aMin;
  });
}
