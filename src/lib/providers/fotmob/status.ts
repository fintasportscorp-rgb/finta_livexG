// ---------------------------------------------------------------------------
// FotMob status/minute normalization helpers.
// ---------------------------------------------------------------------------

import type { MatchStatus } from "../../types";

export function mapFotmobStatus(status: unknown): MatchStatus {
  if (status === null || typeof status !== "object") return "unknown";
  const s = status as Record<string, unknown>;

  const started = s.started === true;
  const finished = s.finished === true;
  const cancelled = s.cancelled === true;

  if (cancelled) return "unknown";
  if (finished) return "finished";

  const reason = readReason(s);
  if (reason.includes("half") && reason.includes("time")) return "halftime";
  if (reason === "ht") return "halftime";

  if (started) return "live";
  return "scheduled";
}

function readReason(s: Record<string, unknown>): string {
  const reason = s.reason;
  if (reason && typeof reason === "object") {
    const short = (reason as Record<string, unknown>).short;
    const long = (reason as Record<string, unknown>).long;
    return `${typeof short === "string" ? short : ""} ${typeof long === "string" ? long : ""}`
      .trim()
      .toLowerCase();
  }
  return "";
}

/**
 * Parse the live minute into a number or null. Handles the several shapes
 * FotMob uses: a plain number, a string ("67", "45+2", "67’", "HT"), or the
 * `liveTime` object `{ short: "67’", long: "...", maxTime, addedTime }`.
 */
export function parseMinute(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);

  if (value && typeof value === "object") {
    const o = value as Record<string, unknown>;
    return parseMinute(o.short ?? o.long ?? o.value ?? o.minute ?? null);
  }

  if (typeof value !== "string") return null;

  const m = value.match(/(\d+)(?:\s*\+\s*(\d+))?/);
  if (!m) return null;
  const base = Number.parseInt(m[1], 10);
  const added = m[2] ? Number.parseInt(m[2], 10) : 0;
  return Number.isFinite(base) ? base + added : null;
}
