// ---------------------------------------------------------------------------
// Alert engine — pure crossing logic. No I/O, no module-global state, so the
// "already alerted" set can be persisted by the caller (e.g. the GitHub Actions
// workflow persists it between runs). This gives correct de-dup across restarts:
//
//   - Alert once when a match CROSSES the threshold on the NET metric (default
//     1.1) — i.e. total xG exceeds total goals by ≥ threshold.
//   - Suppress while it stays elevated.
//   - Re-arm once it falls below (threshold - CLEAR_BAND), so a later re-cross
//     alerts again. Rise → alert → fall → rise → alert again.
// ---------------------------------------------------------------------------

import type { RankedMatch } from "../types";

// Once alerted, goalsOwed must drop this far below the threshold before the
// match can alert again (hysteresis — avoids flapping around the threshold).
export const CLEAR_BAND = 0.3;

export type Decision = "send" | "rearm" | "noop";

export function matchKey(m: RankedMatch): string {
  return `${m.sourceProvider}:${m.sourceMatchId}`;
}

/** Per-match decision given whether it was already in the alerted state. */
export function decide(
  prevAlerted: boolean,
  goalsOwed: number | null,
  threshold: number,
): Decision {
  if (goalsOwed === null) return "noop";
  if (!prevAlerted && goalsOwed >= threshold) return "send";
  if (prevAlerted && goalsOwed < threshold - CLEAR_BAND) return "rearm";
  return "noop";
}

export interface CrossingResult {
  toSend: RankedMatch[];
  // The next "already alerted" state (match keys), for the caller to persist.
  alerted: string[];
}

/**
 * Evaluate all matches against the previous alerted state. Pure: returns the
 * matches that should email now plus the next state. Demo matches and matches
 * without xG are never alerted.
 */
export function evaluateCrossings(
  matches: RankedMatch[],
  threshold: number,
  prevAlerted: Iterable<string>,
): CrossingResult {
  const next = new Set<string>(prevAlerted);
  const toSend: RankedMatch[] = [];

  for (const m of matches) {
    if (m.demo) continue;
    const key = matchKey(m);
    // Alerts use the NET metric: total xG − total goals.
    const d = decide(next.has(key), m.netXg, threshold);
    if (d === "send") {
      next.add(key);
      toSend.push(m);
    } else if (d === "rearm") {
      next.delete(key);
    }
  }

  return { toSend, alerted: [...next].sort() };
}
