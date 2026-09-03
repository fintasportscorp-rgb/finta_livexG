// ---------------------------------------------------------------------------
// FotMobProvider — primary live data source.
//
// Strategy when healthy:
//   1. Fetch the daily match list.
//   2. Keep matches currently in progress.
//   3. Fetch details for those (conservative concurrency).
//   4. Extract score, xG and status.
//   5. Normalize into the common model.
//
// We do NOT implement any anti-bot bypass. Health detection lives in health.ts.
// ---------------------------------------------------------------------------

import type { LiveFootballProvider } from "../provider";
import type { NormalizedMatch, ProviderHealth } from "../../types";
import type { AppConfig } from "../../config";
import { fetchWithTimeout, tryParseJson } from "../../http";
import { probeFotmobHealth } from "./health";
import { extractFotmobXG } from "./xg";
import { mapFotmobStatus, parseMinute } from "./status";

// FotMob moved its public JSON API under /api/data/* (the old /api/matches now 404s).
const BASE = "https://www.fotmob.com/api/data";
const DETAIL_CONCURRENCY = 4;
const MAX_LIVE_DETAILS = 40; // don't hammer FotMob

export class FotMobProvider implements LiveFootballProvider {
  readonly id = "fotmob" as const;

  constructor(private readonly cfg: AppConfig) {}

  isConfigured(): boolean {
    return this.cfg.fotmobEnabled;
  }

  getHealth(): Promise<ProviderHealth> {
    return probeFotmobHealth(this.cfg);
  }

  async getLiveMatches(): Promise<NormalizedMatch[]> {
    const ids = await this.fetchLiveMatchIds();
    const limited = ids.slice(0, MAX_LIVE_DETAILS);

    const results: NormalizedMatch[] = [];
    for (let i = 0; i < limited.length; i += DETAIL_CONCURRENCY) {
      const batch = limited.slice(i, i + DETAIL_CONCURRENCY);
      const settled = await Promise.all(
        batch.map((id) => this.getMatchDetails(id).catch(() => null)),
      );
      for (const m of settled) if (m) results.push(m);
    }
    return results;
  }

  private async fetchLiveMatchIds(): Promise<string[]> {
    const date = todayYyyymmdd();
    const res = await fetchWithTimeout(`${BASE}/matches?date=${date}`, this.cfg.fotmobHealthcheckTimeoutMs * 3);
    if (!res.ok) return [];
    const parsed = tryParseJson(res.body);
    if (!parsed.ok) return [];

    const ids: string[] = [];
    const root = parsed.value as Record<string, unknown>;
    const leagues = Array.isArray(root.leagues) ? root.leagues : [];
    for (const league of leagues) {
      const l = league as Record<string, unknown>;
      const matches = Array.isArray(l.matches) ? l.matches : [];
      for (const match of matches) {
        const m = match as Record<string, unknown>;
        const status = m.status as Record<string, unknown> | undefined;
        const inProgress = status?.started === true && status?.finished !== true;
        if (inProgress && (typeof m.id === "string" || typeof m.id === "number")) {
          ids.push(String(m.id));
        }
      }
    }
    return ids;
  }

  async getMatchDetails(matchId: string): Promise<NormalizedMatch | null> {
    const res = await fetchWithTimeout(
      `${BASE}/matchDetails?matchId=${encodeURIComponent(matchId)}`,
      this.cfg.fotmobHealthcheckTimeoutMs * 2,
    );
    if (!res.ok) return null;
    const parsed = tryParseJson(res.body);
    if (!parsed.ok) return null;

    return normalizeFotmobDetails(matchId, parsed.value);
  }
}

function todayYyyymmdd(): string {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

function pickTeam(node: unknown): { name: string; score: number } {
  const t = (node ?? {}) as Record<string, unknown>;
  const name = typeof t.name === "string" ? t.name : "Unknown";
  const score = typeof t.score === "number" ? t.score : Number.parseInt(String(t.score ?? 0), 10) || 0;
  return { name, score };
}

export function normalizeFotmobDetails(matchId: string, details: unknown): NormalizedMatch | null {
  if (details === null || typeof details !== "object") return null;
  const root = details as Record<string, unknown>;

  const general = (root.general ?? {}) as Record<string, unknown>;
  const header = (root.header ?? {}) as Record<string, unknown>;
  const teamsRaw = Array.isArray(header.teams) ? header.teams : [];

  const home = pickTeam(teamsRaw[0] ?? general.homeTeam);
  const away = pickTeam(teamsRaw[1] ?? general.awayTeam);

  const statusNode = (header.status ?? general.status) as Record<string, unknown> | undefined;
  const status = mapFotmobStatus(statusNode);
  const minute = parseMinute(statusNode?.liveTime ?? (statusNode as Record<string, unknown>)?.["liveTime"]);

  const xg = extractFotmobXG(root);
  const nowIso = new Date().toISOString();
  const competition = typeof general.leagueName === "string" ? general.leagueName : undefined;

  return {
    provider: "fotmob",
    providerMatchId: matchId,
    homeTeam: home.name,
    awayTeam: away.name,
    homeScore: home.score,
    awayScore: away.score,
    homeXG: xg.homeXG,
    awayXG: xg.awayXG,
    xgAvailable: xg.xgAvailable,
    matchMinute: minute,
    status,
    competition,
    kickoff: typeof general.matchTimeUTC === "string" ? general.matchTimeUTC : undefined,
    lastUpdated: nowIso,
    sourceProvider: "fotmob",
    sourceMatchId: matchId,
    sourceLastUpdated: nowIso,
    sourceUrl: `https://www.fotmob.com/match/${matchId}`,
  };
}
