// ---------------------------------------------------------------------------
// Cross-provider match matching. When we fall back per-match, we must only merge
// two providers' records for the SAME fixture. We never match on team name
// alone: we combine normalized home identity, away identity, kickoff proximity
// and (when available) competition into a confidence score, and only merge above
// a safe threshold. Otherwise records are kept separate to avoid duplicates.
// ---------------------------------------------------------------------------

import type { NormalizedMatch } from "./types";

export const MERGE_CONFIDENCE_THRESHOLD = 0.8;

/** Normalize a team name for comparison (diacritics, punctuation, common suffixes). */
export function normalizeTeamName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\b(fc|cf|afc|sc|ac|club|cd|calcio|women|w)\b/g, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

/** Dice coefficient on character bigrams: robust to minor naming differences. */
function similarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const bigrams = (s: string) => {
    const set = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) {
      const g = s.slice(i, i + 2);
      set.set(g, (set.get(g) ?? 0) + 1);
    }
    return set;
  };
  const aa = bigrams(a);
  const bb = bigrams(b);
  let intersection = 0;
  for (const [g, count] of aa) {
    const other = bb.get(g);
    if (other) intersection += Math.min(count, other);
  }
  return (2 * intersection) / (a.length - 1 + (b.length - 1));
}

function kickoffScore(a?: string, b?: string): number | null {
  if (!a || !b) return null;
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  if (Number.isNaN(ta) || Number.isNaN(tb)) return null;
  const diffMin = Math.abs(ta - tb) / 60000;
  if (diffMin <= 5) return 1;
  if (diffMin <= 15) return 0.8;
  if (diffMin <= 45) return 0.4;
  return 0;
}

export interface MatchConfidence {
  score: number;
  homeSim: number;
  awaySim: number;
  kickoff: number | null;
  competition: number | null;
}

/**
 * Confidence that two records describe the same fixture. Weighted blend of team
 * identity (dominant), kickoff proximity and competition agreement.
 */
export function matchConfidence(a: NormalizedMatch, b: NormalizedMatch): MatchConfidence {
  const homeSim = similarity(normalizeTeamName(a.homeTeam), normalizeTeamName(b.homeTeam));
  const awaySim = similarity(normalizeTeamName(a.awayTeam), normalizeTeamName(b.awayTeam));
  const kickoff = kickoffScore(a.kickoff, b.kickoff);

  let competition: number | null = null;
  if (a.competition && b.competition) {
    competition = similarity(normalizeTeamName(a.competition), normalizeTeamName(b.competition));
  }

  // Team identity is the backbone (70%). Kickoff and competition refine it.
  const teamScore = (homeSim + awaySim) / 2;
  let score = teamScore * 0.7;
  let weightUsed = 0.7;

  if (kickoff !== null) {
    score += kickoff * 0.2;
    weightUsed += 0.2;
  }
  if (competition !== null) {
    score += competition * 0.1;
    weightUsed += 0.1;
  }
  // Re-scale so absent signals don't unfairly deflate the score.
  score = score / weightUsed;

  return { score, homeSim, awaySim, kickoff, competition };
}

/** Find the best candidate in `pool` for `target`, if any clears the threshold. */
export function findBestMatch(
  target: NormalizedMatch,
  pool: NormalizedMatch[],
  threshold = MERGE_CONFIDENCE_THRESHOLD,
): { match: NormalizedMatch; confidence: MatchConfidence } | null {
  let best: { match: NormalizedMatch; confidence: MatchConfidence } | null = null;
  for (const candidate of pool) {
    const confidence = matchConfidence(target, candidate);
    if (confidence.score >= threshold && (best === null || confidence.score > best.confidence.score)) {
      best = { match: candidate, confidence };
    }
  }
  return best;
}
