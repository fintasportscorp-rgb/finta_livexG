"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { LiveDataResult } from "@/lib/types";
import { MatchCard } from "./components/MatchCard";
import { fmtDateTime, fmtTimeAgo, providerLabel } from "./components/format";

const DEFAULT_REFRESH_SECONDS = 60;

export default function Dashboard() {
  const [data, setData] = useState<LiveDataResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/live", { cache: "no-store" });
      const json = (await res.json()) as LiveDataResult;
      setData(json);
    } catch {
      // A transport failure is presented the same as "no matches" per product intent.
      setData(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Auto-refresh on landing (and on every F5, since this remounts) + interval.
  useEffect(() => {
    load();
    timer.current = setInterval(load, DEFAULT_REFRESH_SECONDS * 1000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [load]);

  // Tick so the "x seconds ago" label stays live between refreshes.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  void now;

  const source = data?.activeProvider ? providerLabel(data.activeProvider) : null;
  const hasMatches = !!data && data.matches.length > 0;
  const showEmpty = !loading && !hasMatches;

  return (
    <main className="wrap">
      <header className="header">
        <div className="brand">
          <h1>
            FotAlert <span className="brand-live">LIVE</span>
          </h1>
          <p className="tag">
            In-play matches ranked by <strong>which are most likely to see the next goal</strong> —
            biggest xG deficit, with enough time left to convert.
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

      <section className="legend" aria-label="How to read the metrics">
        <div className="legend-item">
          <span className="badge diff neg hot">−0.9</span>
          <span>
            <strong>Differential = goals − xG</strong> per team. Negative (red, pulsing) means the
            team has created more than it has scored — <strong>a goal is owed and likely sooner</strong>.
          </span>
        </div>
        <div className="legend-item">
          <span className="badge diff pos">+0.9</span>
          <span>Positive (green) means the team has scored above its xG — over-performing.</span>
        </div>
        <div className="legend-item">
          <span className="metric-chip neg hot">1.6</span>
          <span>
            The match score is <strong>goals owed</strong> (xG not yet converted), ranked highest
            when the deficit is large and <strong>more time remains</strong> to convert it.
          </span>
        </div>
      </section>

      {data?.notice ? <div className="notice">{data.notice}</div> : null}

      {loading && !data ? <div className="empty">Loading live matches…</div> : null}

      {showEmpty ? <div className="empty">No live match available.</div> : null}

      {hasMatches ? (
        <div className="cards">
          {data!.matches.map((m, i) => (
            <MatchCard key={`${m.sourceProvider}:${m.sourceMatchId}`} match={m} rank={i + 1} />
          ))}
        </div>
      ) : null}
    </main>
  );
}
