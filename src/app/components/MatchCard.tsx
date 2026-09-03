import type { RankedMatch } from "@/lib/types";
import { fmtDiff, fmtMinute, fmtXg, providerLabel } from "./format";

export function MatchCard({ match, rank }: { match: RankedMatch; rank: number }) {
  const live = match.status === "live" || match.status === "halftime";
  const srcClass = `src-${match.sourceProvider}`;

  return (
    <div className="card">
      <div className="rank">{rank}</div>

      <div className="teams">
        <div className="teamline">
          <span className="score">{match.homeScore}</span>
          <span className="teamname">{match.homeTeam}</span>
        </div>
        <div className="teamline">
          <span className="score">{match.awayScore}</span>
          <span className="teamname">{match.awayTeam}</span>
        </div>

        <div className="meta">
          {/* Provenance: LIVE · 67' · FotMob */}
          <span className={`chip ${live ? "live" : ""}`}>
            {fmtMinute(match.matchMinute, match.status)}
          </span>
          <span className={`chip ${srcClass}`}>{providerLabel(match.sourceProvider)}</span>
          {match.competition ? <span className="chip">{match.competition}</span> : null}
        </div>
      </div>

      <div className="diff">
        {match.overallDiff === null ? (
          <span className="no-xg">xG unavailable</span>
        ) : (
          <>
            <span className="overall">{match.overallDiff.toFixed(2)}</span>
            <span className="detail">
              xG {fmtXg(match.homeXG)}–{fmtXg(match.awayXG)}
            </span>
            <span className="detail">
              Δ {fmtDiff(match.homeDiff)} / {fmtDiff(match.awayDiff)}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
