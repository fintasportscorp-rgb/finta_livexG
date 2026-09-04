import type { RankedMatch } from "@/lib/types";
import { fmtMinute, fmtXg, providerLabel } from "./format";
import {
  classifyDiff,
  diffIsHot,
  fmtRemaining,
  owedIsHot,
  owedTone,
  signed,
} from "./metrics";

interface TeamView {
  side: "H" | "A";
  name: string;
  score: number;
  xg: number | null;
  diff: number | null;
}

function TeamRow({ team }: { team: TeamView }) {
  const tone = classifyDiff(team.diff);
  const hot = diffIsHot(team.diff);
  return (
    <div className="team">
      <span className="tscore">{team.score}</span>
      <span className="tname">
        {team.name} <span className="side">({team.side})</span>
      </span>
      <span className="badge xg" title="Expected goals for this team">
        xG {fmtXg(team.xg)}
      </span>
      <span
        className={`badge diff ${tone}${hot ? " hot" : ""}`}
        title="Goals scored minus this team's xG. Negative ⇒ a goal is owed."
      >
        {signed(team.diff)}
      </span>
    </div>
  );
}

export function MatchCard({ match, rank }: { match: RankedMatch; rank: number }) {
  const live = match.status === "live" || match.status === "halftime";

  const rows: TeamView[] = [
    { side: "H", name: match.homeTeam, score: match.homeScore, xg: match.homeXG, diff: match.homeDiff },
    { side: "A", name: match.awayTeam, score: match.awayScore, xg: match.awayXG, diff: match.awayDiff },
  ];
  // Place the negative differential (the team owed a goal) on top.
  if (match.homeDiff !== null && match.awayDiff !== null) {
    rows.sort((a, b) => (a.diff ?? 0) - (b.diff ?? 0));
  }

  const owed = match.goalsOwed;
  const tone = owedTone(owed);
  const hot = owedIsHot(owed);

  return (
    <div className="card">
      <div className="rank">{rank}</div>

      <div className="card-main">
        <div className="card-head">
          <span className={`chip ${live ? "live" : ""}`}>
            {live ? "● " : ""}
            {fmtMinute(match.matchMinute, match.status)}
          </span>
          {match.remainingMinutes !== null ? (
            <span className="chip time">{fmtRemaining(match.remainingMinutes, match.status)}</span>
          ) : null}
          {match.competition ? <span className="chip comp">{match.competition}</span> : null}
          <span className={`chip src-${match.sourceProvider}`}>
            {providerLabel(match.sourceProvider)}
          </span>
          {match.demo ? <span className="chip demo">DEMO</span> : null}
        </div>

        <div className="teams">
          {rows.map((t) => (
            <TeamRow key={t.side} team={t} />
          ))}
        </div>
      </div>

      <div className={`metric ${owed === null ? "na" : tone}${hot ? " hot" : ""}`}>
        {owed === null ? (
          <span className="metric-na">xG unavailable</span>
        ) : (
          <>
            <span className="metric-value">{owed.toFixed(2)}</span>
            <span className="metric-unit">goals owed</span>
          </>
        )}
      </div>
    </div>
  );
}
