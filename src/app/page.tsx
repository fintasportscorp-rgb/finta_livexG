"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LiveDataResult, Metric } from "@/lib/types";
import { sortByMetric } from "@/lib/ranking";
import { MatchCard } from "./components/MatchCard";
import { fmtDateTime, fmtTimeAgo, providerLabel } from "./components/format";

const DEFAULT_REFRESH_SECONDS = 60;

export default function Dashboard() {
  const [data, setData] = useState<LiveDataResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [metric, setMetric] = useState<Metric>("net");
  const [now, setNow] = useState(() => Date.now());
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/live", { cache: "no-store" });
      const json = (await res.json()) as LiveDataResult;
      setData(json);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    timer.current = setInterval(load, DEFAULT_REFRESH_SECONDS * 1000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [load]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  void now;

  // Re-sort client-side when the metric filter changes (no refetch needed).
  const matches = useMemo(
    () => (data ? sortByMetric(data.matches, metric) : []),
    [data, metric],
  );

  const source = data?.activeProvider ? providerLabel(data.activeProvider) : null;
  const hasMatches = matches.length > 0;
  const showEmpty = !loading && !hasMatches;

  return (
    <main className="wrap">
      <header className="header">
        <div className="brand">
          <h1>
            Finta Spot <span className="brand-live">LIVE</span>
          </h1>
          <p className="tag">
            In-play matches ranked by <strong>combined xG minus goals scored</strong> — how many
            goals the chances say are still owed, weighted by time left.
          </p>
        </div>
        <div className="head-actions">
          {source ? <span className="source-pill on">Source: {source}</span> : null}
          <button className="refresh" onClick={load} disabled={refreshing}>
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </header>

      <div className="refresh-line">
        <span className={`dot ${refreshing ? "amber" : "green"}`} />
        Auto-refreshing every {DEFAULT_REFRESH_SECONDS}s
        {data ? (
          <>
            {" · "}last refresh <strong>{fmtDateTime(data.generatedAt)}</strong>{" "}
            <span className="muted">({fmtTimeAgo(data.generatedAt)})</span>
          </>
        ) : null}
      </div>

      <div className="filters">
        <span className="filter-label">Rank by</span>
        <div className="segmented">
          <button
            className={metric === "net" ? "active" : ""}
            onClick={() => setMetric("net")}
            title="(homeXG + awayXG) − total goals. A team scoring above its xG offsets it."
          >
            Net xG − goals
          </button>
          <button
            className={metric === "owed" ? "active" : ""}
            onClick={() => setMetric("owed")}
            title="Per-team unconverted xG; over-performing teams don't offset."
          >
            Per-team owed
          </button>
        </div>
      </div>

      <section className="legend" aria-label="How to read the metrics">
        <div className="legend-item">
          <span className="metric-chip neg hot">+1.6</span>
          <span>
            <strong>
              {metric === "net" ? "Net xG − goals" : "Goals owed"}
            </strong>{" "}
            {metric === "net"
              ? "= (home xG + away xG) − total goals. High positive ⇒ the teams have created well beyond what they've scored (a team scoring above its xG offsets it). Alerts fire at ≥ 1.1."
              : "= each team's unconverted xG added up (surplus ignored)."}
          </span>
        </div>
        <div className="legend-item">
          <span className="badge diff neg hot">−0.9</span>
          <span>
            Per-team <strong>goals − xG</strong>. Negative (red, pulsing) = created more than
            scored; positive (green) = scored above xG. The owed team is shown on top.
          </span>
        </div>
      </section>

      {data?.notice ? <div className="notice">{data.notice}</div> : null}

      {loading && !data ? <div className="empty">Loading live matches…</div> : null}
      {showEmpty ? <div className="empty">No live match available.</div> : null}

      {hasMatches ? (
        <div className="cards">
          {matches.map((m, i) => (
            <MatchCard key={`${m.sourceProvider}:${m.sourceMatchId}`} match={m} rank={i + 1} metric={metric} />
          ))}
        </div>
      ) : null}
    </main>
  );
}
