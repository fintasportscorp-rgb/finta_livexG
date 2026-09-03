// ---------------------------------------------------------------------------
// The provider abstraction. Adding a new data source (e.g. a future Hudl Live
// Football Data adapter) means implementing this interface only — the ranking,
// matching and UI layers never change.
// ---------------------------------------------------------------------------

import type { NormalizedMatch, ProviderHealth, ProviderId } from "../types";

export interface LiveFootballProvider {
  readonly id: ProviderId;

  /** Is this provider switched on AND supplied with any credentials it needs? */
  isConfigured(): boolean;

  /** Lightweight connectivity probe from the real runtime environment. */
  getHealth(): Promise<ProviderHealth>;

  /** Live/in-progress matches, already normalized. */
  getLiveMatches(): Promise<NormalizedMatch[]>;

  /** Details for a single match, normalized. Null if not resolvable. */
  getMatchDetails(matchId: string): Promise<NormalizedMatch | null>;
}
