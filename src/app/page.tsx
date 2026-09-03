"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { LiveDataResult } from "@/lib/types";
import { MatchCard } from "./components/MatchCard";
import { ProviderStatusPanel } from "./components/ProviderStatusPanel";
import { Diagnostics } from "./components/Diagnostics";
import { fmtTimeAgo } from "./components/format";

const DEFAULT_REFRESH_SECONDS = 60;

export default function Dashboard() {
  const [data, setData] = useState<LiveDataResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/live", { cache: "no-store" });
      const json = (await res.json()) as LiveDataResult;
      setData(json);
      setFetchError(null);
    } catch {
      setFetchError("Could not reach the FotAlert server.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    timer.current = setInterval(load, DEFAULT_REFRESH_SECONDS * 1000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [load]);

  return (
    <main className="wrap">
      <div className="header">
        <div>
          <h1>FotAlert</h1>
          <div className="sub">Live matches ranked by goals-vs-xG differential</div>
        </div>
        <button className="refresh" onClick={load}>
          Refresh
        </button>
      </div>

      {/* Transparent fallback notice */}
      {data?.notice ? <div className="notice">{data.notice}</div> : null}
      {data?.error ? <div className="error">{data.error}</div> : null}
      {fetchError ? <div className="error">{fetchError}</div> : null}

      {loading && !data ? (
        <div className="empty">Checking providers and loading live matches…</div>
      ) : null}

      {data && data.matches.length === 0 && !data.error ? (
        <div className="empty">No live matches right now.</div>
      ) : null}

      {data && data.matches.length > 0 ? (
        <div className="cards">
          {data.matches.map((m, i) => (
            <MatchCard key={`${m.sourceProvider}:${m.sourceMatchId}`} match={m} rank={i + 1} />
          ))}
        </div>
      ) : null}

      {data ? <ProviderStatusPanel providers={data.providerStatuses} /> : null}
      {data ? <Diagnostics data={data} /> : null}

      {data ? (
        <div className="updated">Last updated {fmtTimeAgo(data.generatedAt)}</div>
      ) : null}
    </main>
  );
}
