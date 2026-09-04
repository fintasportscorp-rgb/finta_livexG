// ---------------------------------------------------------------------------
// Core domain types. The calculation, ranking and UI layers operate ONLY on
// the NormalizedMatch model and must not know which provider produced it.
// ---------------------------------------------------------------------------

export type ProviderId = "fotmob" | "sportmonks";

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
  overallDiff: number | null; // |homeDiff| + |awayDiff| (kept for reference)

  // Goals "owed" by the scoreline: xG created but not yet converted, summed
  // across both teams = max(0,-homeDiff) + max(0,-awayDiff). Higher ⇒ a goal is
  // more overdue. null when xG is unavailable.
  goalsOwed: number | null;

  // Estimated regulation minutes left (drives the time weighting).
  remainingMinutes: number | null;

  // Composite ranking score: goalsOwed weighted by remaining opportunity.
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
