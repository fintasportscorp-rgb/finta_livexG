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

/** Parse the live minute (e.g. "67", "45+2", "HT") into a number or null. */
export function parseMinute(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value !== "string") return null;

  const m = value.match(/(\d+)(?:\+(\d+))?/);
  if (!m) return null;
  const base = Number.parseInt(m[1], 10);
  const added = m[2] ? Number.parseInt(m[2], 10) : 0;
  return Number.isFinite(base) ? base + added : null;
}
