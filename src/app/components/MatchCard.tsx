import type { RankedMatch } from "@/lib/types";
import { fmtMinute, fmtXg, providerLabel } from "./format";
import { classifyDiff, goalsVsXG, matchGoals, matchXG, signed } from "./metrics";

function TeamRow({
  name,
  score,
  xg,
  diff,
}: {
  name: string;
  score: number;
  xg: number | null;
  diff: number | null;
}) {
  const tone = classifyDiff(diff);
  return (
    <div className="team">
      <span className="tscore">{score}</span>
      <span className="tname">{name}</span>
      <span className="badge xg" title="Expected goals for this team">
        xG {fmtXg(xg)}
      </span>
      <span
        className={`badge diff ${tone}`}
        title="Goals scored minus this team's xG (over/under-performance)"
      >
        {signed(diff)}
      </span>
    </div>
  );
}

export function MatchCard({ match, rank }: { match: RankedMatch; rank: number }) {
  const live = match.status === "live" || match.status === "halftime";
  const headline = goalsVsXG(match);
  const headlineTone = classifyDiff(headline);
  const totalXg = matchXG(match);

  return (
    <div className="card">
      <div className="rank">{rank}</div>

      <div className="card-main">
        <div className="card-head">
          <span className={`chip ${live ? "live" : ""}`}>
            {live ? "● " : ""}
            {fmtMinute(match.matchMinute, match.status)}
          </span>
          {match.competition ? <span className="chip comp">{match.competition}</span> : null}
          <span className={`chip src-${match.sourceProvider}`}>
            {providerLabel(match.sourceProvider)}
          </span>
          {match.demo ? <span className="chip demo">DEMO</span> : null}
        </div>

        <div className="teams">
          <TeamRow name={match.homeTeam} score={match.homeScore} xg={match.homeXG} diff={match.homeDiff} />
          <TeamRow name={match.awayTeam} score={match.awayScore} xg={match.awayXG} diff={match.awayDiff} />
        </div>
      </div>

      <div className={`metric ${headline === null ? "na" : headlineTone}`}>
        {headline === null ? (
          <span className="metric-na">xG unavailable</span>
        ) : (
          <>
            <span className="metric-value">{signed(headline)}</span>
            <span className="metric-label">goals − xG</span>
            <span className="metric-sub">
              {matchGoals(match)} goals · {fmtXg(totalXg)} xG
            </span>
          </>
        )}
      </div>
    </div>
  );
}
