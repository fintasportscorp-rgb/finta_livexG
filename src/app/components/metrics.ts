// ---------------------------------------------------------------------------
// Display-metric helpers for a ranked match. Pure functions over the normalized
// model — no provider knowledge. Used by MatchCard.
//
//   perTeamDiff  = teamGoals - teamXG            (over/under-performance)
//   matchGoals   = homeGoals + awayGoals
//   matchXG      = homeXG + awayXG
//   goalsVsXG    = matchGoals - matchXG          (headline metric)
// ---------------------------------------------------------------------------

import type { RankedMatch } from "@/lib/types";

export type DiffTone = "pos" | "neg" | "neutral";

// Dead-zone so tiny divergences read as neutral rather than green/red noise.
const NEUTRAL_BAND = 0.25;

export function classifyDiff(diff: number | null): DiffTone {
  if (diff === null || Number.isNaN(diff)) return "neutral";
  if (diff > NEUTRAL_BAND) return "pos";
  if (diff < -NEUTRAL_BAND) return "neg";
  return "neutral";
}

export function matchGoals(m: RankedMatch): number {
  return m.homeScore + m.awayScore;
}

export function matchXG(m: RankedMatch): number | null {
  if (!m.xgAvailable || m.homeXG === null || m.awayXG === null) return null;
  return m.homeXG + m.awayXG;
}

/** Headline metric: total goals minus total xG across both teams (signed). */
export function goalsVsXG(m: RankedMatch): number | null {
  const xg = matchXG(m);
  return xg === null ? null : matchGoals(m) - xg;
}

export function signed(value: number | null, digits = 2): string {
  if (value === null || Number.isNaN(value)) return "—";
  const s = value > 0 ? "+" : "";
  return `${s}${value.toFixed(digits)}`;
}
