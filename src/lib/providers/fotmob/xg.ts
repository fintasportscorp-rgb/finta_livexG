// ---------------------------------------------------------------------------
// FotMob xG extraction. xG is NOT at a fixed array position, so we search the
// stat groups by name/key. We accept ONLY standard team Expected goals (xG) and
// explicitly reject xG-derived metrics (xGoT, npxG, xPTS, etc.).
// ---------------------------------------------------------------------------

export interface ExtractedXG {
  homeXG: number | null;
  awayXG: number | null;
  xgAvailable: boolean;
}

const REJECT_KEYS = [
  "expected_goals_on_target", // xGoT
  "expected_goals_on_target_xgot",
  "xgot",
  "non_penalty_expected_goals", // npxG
  "npxg",
  "expected_points", // xPTS
  "xpts",
  "expected_assists", // xA
  "xa",
];

const ACCEPT_KEYS = ["expected_goals", "expected_goals_xg"];

function normalizeTitle(s: string): string {
  return s.toLowerCase().replace(/[\s_()]/g, "");
}

/** Is this a stat we must NOT treat as standard xG? */
function isRejected(key: string, title: string): boolean {
  const k = (key ?? "").toLowerCase();
  const t = normalizeTitle(title ?? "");
  if (REJECT_KEYS.some((r) => k === r || k.includes(r))) return true;
  // Title guards for the derived metrics.
  if (t.includes("ontarget")) return true; // xGoT
  if (t.includes("nonpenalty")) return true; // npxG
  if (t.includes("expectedpoints") || t === "xpts") return true;
  if (t.includes("expectedassist") || t === "xa") return true;
  return false;
}

/** Is this the standard team Expected goals (xG) stat? */
function isStandardXG(key: string, title: string): boolean {
  const k = (key ?? "").toLowerCase();
  const t = normalizeTitle(title ?? "");
  if (isRejected(k, title)) return false;
  if (ACCEPT_KEYS.includes(k)) return true;
  // Accept an exact "expected goals (xg)" / "xg" title, but nothing derived.
  if (t === "expectedgoalsxg" || t === "expectedgoals" || t === "xg") return true;
  return false;
}

function toNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number.parseFloat(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * Walk an arbitrary FotMob matchDetails object and pull the standard xG pair.
 * We recurse defensively because FotMob's stat nesting varies by response.
 */
export function extractFotmobXG(details: unknown): ExtractedXG {
  const found = search(details);
  if (found && found.home !== null && found.away !== null) {
    return { homeXG: found.home, awayXG: found.away, xgAvailable: true };
  }
  return { homeXG: null, awayXG: null, xgAvailable: false };
}

interface Pair {
  home: number | null;
  away: number | null;
}

function search(node: unknown): Pair | null {
  if (node === null || typeof node !== "object") return null;

  if (Array.isArray(node)) {
    for (const item of node) {
      const hit = matchStatEntry(item) ?? search(item);
      if (hit) return hit;
    }
    return null;
  }

  const obj = node as Record<string, unknown>;
  const direct = matchStatEntry(obj);
  if (direct) return direct;

  for (const key of Object.keys(obj)) {
    const hit = search(obj[key]);
    if (hit) return hit;
  }
  return null;
}

/**
 * A FotMob stat entry typically looks like:
 *   { key: "expected_goals", title: "Expected goals (xG)", stats: [home, away] }
 * We validate the label before trusting the numbers.
 */
function matchStatEntry(node: unknown): Pair | null {
  if (node === null || typeof node !== "object" || Array.isArray(node)) return null;
  const obj = node as Record<string, unknown>;

  const key = typeof obj.key === "string" ? obj.key : "";
  const title = typeof obj.title === "string" ? obj.title : "";
  if (!key && !title) return null;
  if (!isStandardXG(key, title)) return null;

  const stats = obj.stats;
  if (Array.isArray(stats) && stats.length >= 2) {
    return { home: toNumber(stats[0]), away: toNumber(stats[1]) };
  }
  const home = toNumber(obj.home ?? obj.homeValue);
  const away = toNumber(obj.away ?? obj.awayValue);
  if (home !== null || away !== null) return { home, away };
  return null;
}
