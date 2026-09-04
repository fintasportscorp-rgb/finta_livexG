// ---------------------------------------------------------------------------
// Alert engine. Fires one email when a match CROSSES the goals-owed threshold
// (default 1.1), then suppresses further emails for that match until it drops
// back below a hysteresis band — so a match hovering around the threshold does
// not email on every 60s refresh.
//
// De-dup state is in-memory and process-local. On serverless this is per
// instance, so a cron running on multiple instances could in rare cases send a
// duplicate. For strict once-only delivery, back this with a shared store
// (e.g. Vercel KV). Good enough for a single-writer cron.
// ---------------------------------------------------------------------------

import { loadConfig } from "../config";
import type { RankedMatch } from "../types";
import { sendGoalOwedEmail } from "./email";

// Hysteresis: once alerted, require goalsOwed to fall this far below the
// threshold before the match becomes eligible to alert again.
const CLEAR_BAND = 0.3;

// matchIds currently in the "already alerted" state.
const alerted = new Set<string>();

function matchKey(m: RankedMatch): string {
  return `${m.sourceProvider}:${m.sourceMatchId}`;
}

/** Decide whether this match should alert now, updating de-dup state. */
export function shouldAlert(m: RankedMatch, threshold: number): boolean {
  if (m.demo) return false; // never alert on synthetic demo matches
  if (m.goalsOwed === null) return false;

  const key = matchKey(m);
  const isAlerted = alerted.has(key);

  if (m.goalsOwed >= threshold && !isAlerted) {
    alerted.add(key);
    return true;
  }
  if (isAlerted && m.goalsOwed < threshold - CLEAR_BAND) {
    alerted.delete(key); // reset so a later re-cross can alert again
  }
  return false;
}

export interface DispatchSummary {
  enabled: boolean;
  evaluated: number;
  triggered: number;
  sent: number;
  errors: string[];
}

/**
 * Evaluate matches and send an email for each that newly crossed the threshold.
 * Never throws — returns a summary the caller can log.
 */
export async function dispatchGoalOwedAlerts(matches: RankedMatch[]): Promise<DispatchSummary> {
  const cfg = loadConfig();
  const summary: DispatchSummary = {
    enabled: cfg.alertsEnabled,
    evaluated: matches.length,
    triggered: 0,
    sent: 0,
    errors: [],
  };
  if (!cfg.alertsEnabled) return summary;

  for (const m of matches) {
    if (!shouldAlert(m, cfg.alertGoalsOwedThreshold)) continue;
    summary.triggered += 1;
    const res = await sendGoalOwedEmail(cfg, m);
    if (res.ok) summary.sent += 1;
    else if (res.error) summary.errors.push(`${matchKey(m)}: ${res.error}`);
  }
  return summary;
}

// Test helper.
export function __resetAlertStateForTests(): void {
  alerted.clear();
}
