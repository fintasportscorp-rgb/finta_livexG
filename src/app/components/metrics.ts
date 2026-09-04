// ---------------------------------------------------------------------------
// Display-metric helpers for a ranked match. Pure functions over the normalized
// model — no provider knowledge. Used by MatchCard.
//
// A negative per-team differential (goals - xG) means a goal is "owed". The
// stronger the deficit, the more it should draw the eye ("startling").
// ---------------------------------------------------------------------------

import type { RankedMatch } from "@/lib/types";

export type DiffTone = "pos" | "neg" | "neutral";

// Dead-zone so tiny divergences read as neutral rather than green/red noise.
const NEUTRAL_BAND = 0.25;
// Beyond this deficit a goal is strongly "owed" → apply the startling effect.
const HOT_DEFICIT = 0.75;

export function classifyDiff(diff: number | null): DiffTone {
  if (diff === null || Number.isNaN(diff)) return "neutral";
  if (diff > NEUTRAL_BAND) return "pos";
  if (diff < -NEUTRAL_BAND) return "neg";
  return "neutral";
}

/** True when a team is far enough below its xG that a goal is strongly due. */
export function diffIsHot(diff: number | null): boolean {
  return diff !== null && diff <= -HOT_DEFICIT;
}

/** Tone for the match-level "goals owed" headline. */
export function owedTone(goalsOwed: number | null): DiffTone {
  if (goalsOwed === null) return "neutral";
  if (goalsOwed >= NEUTRAL_BAND) return "neg"; // something is owed → alert color
  return "neutral";
}

export function owedIsHot(goalsOwed: number | null): boolean {
  return goalsOwed !== null && goalsOwed >= 1;
}

export function signed(value: number | null, digits = 2): string {
  if (value === null || Number.isNaN(value)) return "—";
  const s = value > 0 ? "+" : "";
  return `${s}${value.toFixed(digits)}`;
}

/** Compact remaining-time label, e.g. "34′ left". */
export function fmtRemaining(remaining: number | null, status: string): string {
  if (status === "finished") return "full time";
  if (remaining === null) return "";
  if (remaining <= 0) return "closing";
  return `${remaining}′ left`;
}
