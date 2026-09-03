// ---------------------------------------------------------------------------
// Normalize a Sportmonks v3 fixture into the common NormalizedMatch model.
// xG comes from the statistics include; we look up the xG type by code/name and
// never substitute a derived metric.
// ---------------------------------------------------------------------------

import type { MatchStatus, NormalizedMatch } from "../../types";

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number.parseFloat(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function mapState(state: unknown): { status: MatchStatus; minute: number | null } {
  const s = (state ?? {}) as Record<string, unknown>;
  const code = String(s.short_name ?? s.state ?? "").toUpperCase();
  const minute = num(s.minute);

  switch (code) {
    case "LIVE":
    case "1ST_HALF":
    case "2ND_HALF":
    case "ET":
    case "PEN_LIVE":
    case "INPLAY":
      return { status: "live", minute };
    case "HT":
      return { status: "halftime", minute };
    case "FT":
    case "AET":
    case "FT_PEN":
      return { status: "finished", minute };
    case "NS":
      return { status: "scheduled", minute };
    case "POSTP":
    case "SUSP":
    case "CANC":
      return { status: "paused", minute };
    default:
      return { status: "unknown", minute };
  }
}

function readTeams(participants: unknown): {
  home: string;
  away: string;
  homeId: string | null;
  awayId: string | null;
} {
  const list = Array.isArray(participants) ? participants : [];
  let home = "Unknown";
  let away = "Unknown";
  let homeId: string | null = null;
  let awayId: string | null = null;

  for (const p of list) {
    const obj = (p ?? {}) as Record<string, unknown>;
    const meta = (obj.meta ?? {}) as Record<string, unknown>;
    const location = String(meta.location ?? "");
    const name = typeof obj.name === "string" ? obj.name : "Unknown";
    const id = obj.id != null ? String(obj.id) : null;
    if (location === "home") {
      home = name;
      homeId = id;
    } else if (location === "away") {
      away = name;
      awayId = id;
    }
  }
  return { home, away, homeId, awayId };
}

function readScores(scores: unknown): { home: number; away: number } {
  const list = Array.isArray(scores) ? scores : [];
  let home = 0;
  let away = 0;
  // Prefer the CURRENT running score.
  for (const s of list) {
    const obj = (s ?? {}) as Record<string, unknown>;
    if (String(obj.description ?? "") !== "CURRENT") continue;
    const score = (obj.score ?? {}) as Record<string, unknown>;
    const participant = String(score.participant ?? "");
    const goals = num(score.goals) ?? 0;
    if (participant === "home") home = goals;
    else if (participant === "away") away = goals;
  }
  return { home, away };
}

const XG_CODES = ["expected-goals", "expected_goals", "xg"];

function readXG(
  statistics: unknown,
  homeId: string | null,
  awayId: string | null,
): { homeXG: number | null; awayXG: number | null; xgAvailable: boolean } {
  const list = Array.isArray(statistics) ? statistics : [];
  let homeXG: number | null = null;
  let awayXG: number | null = null;

  for (const stat of list) {
    const obj = (stat ?? {}) as Record<string, unknown>;
    const type = (obj.type ?? {}) as Record<string, unknown>;
    const code = String(type.developer_name ?? type.code ?? type.name ?? "").toLowerCase();
    const isXg = XG_CODES.some((c) => code === c || code === c.replace(/[-_]/g, ""));
    if (!isXg) continue;

    const data = (obj.data ?? {}) as Record<string, unknown>;
    const value = num(data.value ?? obj.value);
    if (value === null) continue;

    const participantId = obj.participant_id != null ? String(obj.participant_id) : null;
    if (participantId && participantId === homeId) homeXG = value;
    else if (participantId && participantId === awayId) awayXG = value;
  }

  const xgAvailable = homeXG !== null && awayXG !== null;
  return { homeXG, awayXG, xgAvailable };
}

export function normalizeSportmonksFixture(fixture: unknown): NormalizedMatch | null {
  if (fixture === null || typeof fixture !== "object") return null;
  const f = fixture as Record<string, unknown>;
  const id = f.id != null ? String(f.id) : null;
  if (!id) return null;

  const teams = readTeams(f.participants);
  const scores = readScores(f.scores);
  const { status, minute } = mapState(f.state);
  const xg = readXG(f.statistics, teams.homeId, teams.awayId);

  const league = (f.league ?? {}) as Record<string, unknown>;
  const competition = typeof league.name === "string" ? league.name : undefined;
  const kickoff = typeof f.starting_at === "string" ? f.starting_at : undefined;
  const nowIso = new Date().toISOString();

  return {
    provider: "sportmonks",
    providerMatchId: id,
    homeTeam: teams.home,
    awayTeam: teams.away,
    homeScore: scores.home,
    awayScore: scores.away,
    homeXG: xg.homeXG,
    awayXG: xg.awayXG,
    xgAvailable: xg.xgAvailable,
    matchMinute: minute,
    status,
    competition,
    kickoff,
    lastUpdated: nowIso,
    sourceProvider: "sportmonks",
    sourceMatchId: id,
    sourceLastUpdated: nowIso,
    sourceUrl: `https://www.sportmonks.com/football/fixtures/${id}`,
  };
}
