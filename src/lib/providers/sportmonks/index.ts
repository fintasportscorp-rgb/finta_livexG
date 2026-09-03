// ---------------------------------------------------------------------------
// SportmonksProvider — primary fallback. Uses the Sportmonks Football API,
// including its xG functionality, to obtain live fixtures, teams, score, live
// status/minute and home/away xG.
//
// The API key is read server-side only (never bundled to the client).
// We never present Sportmonks data as FotMob data — provenance is preserved.
// ---------------------------------------------------------------------------

import type { LiveFootballProvider } from "../provider";
import type { NormalizedMatch, ProviderHealth } from "../../types";
import type { AppConfig } from "../../config";
import { fetchWithTimeout, tryParseJson } from "../../http";
import { probeSportmonksHealth } from "./health";
import { normalizeSportmonksFixture } from "./normalize";

const BASE = "https://api.sportmonks.com/v3/football";
// Includes needed for live score, participants (teams), state and xG statistics.
const INCLUDES = "participants;scores;state;league;statistics.type";

export class SportmonksProvider implements LiveFootballProvider {
  readonly id = "sportmonks" as const;

  constructor(private readonly cfg: AppConfig) {}

  isConfigured(): boolean {
    return this.cfg.sportmonksEnabled && this.cfg.sportmonksApiKey !== null;
  }

  getHealth(): Promise<ProviderHealth> {
    return probeSportmonksHealth(this.cfg);
  }

  async getLiveMatches(): Promise<NormalizedMatch[]> {
    if (!this.isConfigured()) return [];

    const url = `${BASE}/livescores/inplay?include=${encodeURIComponent(INCLUDES)}`;
    const res = await fetchWithTimeout(url, this.cfg.fotmobHealthcheckTimeoutMs * 3, {
      headers: { Authorization: this.cfg.sportmonksApiKey ?? "" },
    });
    if (!res.ok) return [];

    const parsed = tryParseJson(res.body);
    if (!parsed.ok) return [];

    const root = parsed.value as Record<string, unknown>;
    const data = Array.isArray(root.data) ? root.data : [];
    const matches: NormalizedMatch[] = [];
    for (const fixture of data) {
      const m = normalizeSportmonksFixture(fixture);
      if (m) matches.push(m);
    }
    return matches;
  }

  async getMatchDetails(matchId: string): Promise<NormalizedMatch | null> {
    if (!this.isConfigured()) return null;

    const url = `${BASE}/fixtures/${encodeURIComponent(matchId)}?include=${encodeURIComponent(INCLUDES)}`;
    const res = await fetchWithTimeout(url, this.cfg.fotmobHealthcheckTimeoutMs * 2, {
      headers: { Authorization: this.cfg.sportmonksApiKey ?? "" },
    });
    if (!res.ok) return null;

    const parsed = tryParseJson(res.body);
    if (!parsed.ok) return null;

    const root = parsed.value as Record<string, unknown>;
    return normalizeSportmonksFixture(root.data);
  }
}
