// ---------------------------------------------------------------------------
// Ranking. Provider-agnostic — operates purely on the NormalizedMatch model.
//
// Two metrics are computed for every match:
//
//   NET (default): totalXG - totalGoals = (homeXG+awayXG) - (homeScore+awayScore)
//     A team scoring ABOVE its xG offsets one scoring below. Positive ⇒ the
//     match has under-scored its chances → goals due. Can be negative.
//
//   OWED (alternative): max(0,-homeDiff) + max(0,-awayDiff)
//     Only under-performing teams count; surplus is ignored.
//
// Both are weighted by remaining time (more minutes left ⇒ more opportunity),
// so ranking = metricValue × opportunityFactor(remaining). Sort DESC; matches
// without xG rank last. The active metric is chosen by the caller/UI filter.
// ---------------------------------------------------------------------------

import type { MatchStatus, Metric, NormalizedMatch, RankedMatch } from "./types";

const REG_TIME = 90; // regulation minutes used for the remaining-time estimate
const MIN_WEIGHT = 0.25; // floor so late matches still count, just less

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
  const frac = remaining === null ? 0.5 : clamp(remaining / REG_TIME, 0, 1);
  return MIN_WEIGHT + (1 - MIN_WEIGHT) * frac;
}

export function computeDifferentials(match: NormalizedMatch): RankedMatch {
  const remaining = remainingMinutes(match.status, match.matchMinute);

  if (!match.xgAvailable || match.homeXG === null || match.awayXG === null) {
    return {
      ...match,
      homeDiff: null,
      awayDiff: null,
      netXg: null,
      goalsOwed: null,
      remainingMinutes: remaining,
      rankScore: null,
    };
  }

  const homeDiff = match.homeScore - match.homeXG;
  const awayDiff = match.awayScore - match.awayXG;
  const totalXg = match.homeXG + match.awayXG;
  const totalGoals = match.homeScore + match.awayScore;
  const netXg = totalXg - totalGoals;
  const goalsOwed = Math.max(0, -homeDiff) + Math.max(0, -awayDiff);

  return {
    ...match,
    homeDiff,
    awayDiff,
    netXg,
    goalsOwed,
    remainingMinutes: remaining,
    rankScore: rankScoreOf(netXg, remaining),
  };
}

/** The raw value of a metric for a match (net xG, or per-team owed). */
export function metricValue(m: RankedMatch, metric: Metric): number | null {
  return metric === "owed" ? m.goalsOwed : m.netXg;
}

/** metricValue weighted by remaining opportunity — the sort key. */
export function rankScoreOf(value: number | null, remaining: number | null): number | null {
  return value === null ? null : value * opportunityFactor(remaining);
}

/** Sort a NEW array by the chosen metric × time. Matches without xG go last. */
export function sortByMetric(matches: RankedMatch[], metric: Metric): RankedMatch[] {
  return [...matches].sort((a, b) => {
    const av = metricValue(a, metric);
    const bv = metricValue(b, metric);
    const aHas = av !== null;
    const bHas = bv !== null;
    if (aHas !== bHas) return aHas ? -1 : 1;

    if (aHas && bHas) {
      const as = rankScoreOf(av, a.remainingMinutes)!;
      const bs = rankScoreOf(bv, b.remainingMinutes)!;
      if (bs !== as) return bs - as;
      if (bv! !== av!) return bv! - av!;
      const aRem = a.remainingMinutes ?? -1;
      const bRem = b.remainingMinutes ?? -1;
      if (bRem !== aRem) return bRem - aRem;
    }

    const aMin = a.matchMinute ?? -1;
    const bMin = b.matchMinute ?? -1;
    return bMin - aMin;
  });
}

/** Compute differentials and rank by the given metric (default: net). */
export function rankMatches(matches: NormalizedMatch[], metric: Metric = "net"): RankedMatch[] {
  return sortByMetric(matches.map(computeDifferentials), metric);
}
