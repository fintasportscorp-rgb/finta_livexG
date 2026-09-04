// ---------------------------------------------------------------------------
// Display-metric helpers. Pure functions over the ranked model — no provider
// knowledge. Used by MatchCard and the page filter.
// ---------------------------------------------------------------------------

import type { Metric, RankedMatch } from "@/lib/types";
import { metricValue } from "@/lib/ranking";

export type DiffTone = "pos" | "neg" | "neutral";

// Per-team differential colouring.
const NEUTRAL_BAND = 0.25;
const HOT_DEFICIT = 0.75;

export function classifyDiff(diff: number | null): DiffTone {
  if (diff === null || Number.isNaN(diff)) return "neutral";
  if (diff > NEUTRAL_BAND) return "pos";
  if (diff < -NEUTRAL_BAND) return "neg";
  return "neutral";
}

/** A team far enough below its xG that a goal is strongly due → startling. */
export function diffIsHot(diff: number | null): boolean {
  return diff !== null && diff <= -HOT_DEFICIT;
}

// Match-level headline (net xG or goals owed). A high positive value means the
// match has under-scored its chances → "goals due" → alert colour + pulse.
const HEADLINE_HOT = 1.1; // matches the default alert threshold
const HEADLINE_WARM = 0.4;

export function headlineTone(value: number | null): DiffTone {
  if (value === null) return "neutral";
  if (value >= HEADLINE_WARM) return "neg"; // due a goal → alert colour
  if (value <= -HEADLINE_WARM) return "pos"; // over-scored → calm/green
  return "neutral";
}

export function headlineIsHot(value: number | null): boolean {
  return value !== null && value >= HEADLINE_HOT;
}

/** Short label under the headline number for the active metric. */
export function metricLabel(metric: Metric): string {
  return metric === "owed" ? "goals owed" : "xG − goals";
}

export function headlineValue(m: RankedMatch, metric: Metric): number | null {
  return metricValue(m, metric);
}

export function signed(value: number | null, digits = 2): string {
  if (value === null || Number.isNaN(value)) return "—";
  const s = value > 0 ? "+" : "";
  return `${s}${value.toFixed(digits)}`;
}

export function fmtRemaining(remaining: number | null, status: string): string {
  if (status === "finished") return "full time";
  if (remaining === null) return "";
  if (remaining <= 0) return "closing";
  return `${remaining}′ left`;
}
