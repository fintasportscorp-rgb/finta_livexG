// ---------------------------------------------------------------------------
// Core domain types. The calculation, ranking and UI layers operate ONLY on
// the NormalizedMatch model and must not know which provider produced it.
// ---------------------------------------------------------------------------

export type ProviderId = "fotmob" | "sportmonks";

// Which ranking/display signal is active.
//   "net"  → (homeXG + awayXG) - (homeScore + awayScore); over-scoring offsets.
//   "owed" → per-team unconverted xG: max(0,-homeDiff) + max(0,-awayDiff).
export type Metric = "net" | "owed";

export type MatchStatus =
  | "scheduled"
  | "live"
  | "halftime"
  | "finished"
  | "paused"
  | "unknown";

/**
 * The single, provider-agnostic match shape. Every provider adapter must
 * produce this. Downstream code (ranking, matching, UI) depends on this alone.
 */
export interface NormalizedMatch {
  provider: ProviderId;
  providerMatchId: string;

  homeTeam: string;
  awayTeam: string;

  homeScore: number;
  awayScore: number;

  // xG may legitimately be absent. Never fabricate it.
  homeXG: number | null;
  awayXG: number | null;
  xgAvailable: boolean;

  matchMinute: number | null;
  status: MatchStatus;

  competition?: string;
  kickoff?: string; // ISO 8601

  lastUpdated: string; // ISO 8601 — when the source last refreshed this record

  // Data provenance — retained on every record.
  sourceProvider: ProviderId;
  sourceMatchId: string;
  sourceLastUpdated: string; // ISO 8601
  sourceUrl: string;

  // Set for synthetic demo/mock records so the UI can label them clearly.
  demo?: boolean;
}

/** Health classification for a provider connectivity probe. */
export type HealthStatus =
  | "AVAILABLE"
  | "TEMPORARY_FAILURE"
  | "BLOCKED"
  | "SCHEMA_FAILURE"
  | "DISABLED"
  | "NOT_CONFIGURED";

export interface ProviderHealth {
  provider: ProviderId;
  status: HealthStatus;

  reachable: boolean;
  httpStatus: number | null;
  responseTimeMs: number | null;

  blocked: boolean;
  blockReason: string | null;

  lastSuccessfulRequest: string | null; // ISO 8601
  checkedAt: string; // ISO 8601

  detail?: string;
}

/** A ranked match plus its computed differentials. */
export interface RankedMatch extends NormalizedMatch {
  homeDiff: number | null; // homeGoals - homeXG (negative ⇒ a goal is "owed")
  awayDiff: number | null; // awayGoals - awayXG

  // NET signal (default): total xG minus total goals. Positive ⇒ the teams have
  // created more than they've scored (goals due); a team scoring above its xG
  // reduces it, so this can be negative. null when xG is unavailable.
  netXg: number | null;

  // Per-team unconverted xG (alternative metric, no offset):
  // max(0,-homeDiff) + max(0,-awayDiff). null when xG is unavailable.
  goalsOwed: number | null;

  // Estimated regulation minutes left (drives the time weighting).
  remainingMinutes: number | null;

  // Composite ranking score for the default (net) metric: value × opportunity.
  rankScore: number | null;
}

/** Runtime status of a single provider, surfaced to the diagnostics UI. */
export interface ProviderRuntimeStatus {
  provider: ProviderId;
  enabled: boolean;
  configured: boolean;
  health: ProviderHealth;
  failureCount: number;
  cooldownRemainingSeconds: number;
  matchesReturned: number;
  active: boolean; // is this the provider currently serving data?
}

/** The full payload the live endpoint returns to the dashboard. */
export interface LiveDataResult {
  matches: RankedMatch[];
  activeProvider: ProviderId | null;
  fallbackActive: boolean;
  providerStatuses: ProviderRuntimeStatus[];
  notice: string | null;
  generatedAt: string; // ISO 8601
  error: string | null;
}
