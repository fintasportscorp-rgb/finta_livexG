// ---------------------------------------------------------------------------
// Alert check endpoint — hit by cron-job.org every ~60s for low-latency alerts.
// Runs on Vercel (FotMob reachable from iad1), de-dups via Upstash Redis, and
// sends via Resend. Server-side only.
//
// Auth: if ALERT_CRON_SECRET is set, the request must carry it as `?token=` or
// `Authorization: Bearer <secret>`. This blocks public triggering.
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { loadConfig } from "@/lib/config";
import { getLiveData } from "@/lib/orchestrator";
import { rankMatches } from "@/lib/ranking";
import { evaluateCrossings } from "@/lib/alerts/engine";
import { sendGoalOwedEmail } from "@/lib/alerts/email";
import { memoryStore, upstashConfigured, upstashStore } from "@/lib/alerts/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(request: Request) {
  const secret = process.env.ALERT_CRON_SECRET;
  if (secret) {
    const url = new URL(request.url);
    const token = url.searchParams.get("token");
    const auth = request.headers.get("authorization");
    if (token !== secret && auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const cfg = loadConfig();
  const store = upstashStore() ?? memoryStore();

  try {
    const data = await getLiveData();
    const matches = rankMatches(data.matches);
    const prev = await store.load();
    const { toSend, alerted } = evaluateCrossings(matches, cfg.alertGoalsOwedThreshold, prev);

    let sent = 0;
    const errors: string[] = [];
    if (cfg.alertsEnabled) {
      for (const m of toSend) {
        const r = await sendGoalOwedEmail(cfg, m);
        if (r.ok) sent += 1;
        else if (r.error) errors.push(`${m.sourceProvider}:${m.sourceMatchId}: ${r.error}`);
      }
    }

    // Persist even on partial failure so we don't re-spam matches that sent.
    await store.save(alerted);

    return NextResponse.json(
      {
        checkedAt: new Date().toISOString(),
        store: store.name,
        upstash: upstashConfigured(),
        alertsEnabled: cfg.alertsEnabled,
        recipient: cfg.alertToEmail,
        threshold: cfg.alertGoalsOwedThreshold,
        activeProvider: data.activeProvider,
        matches: matches.length,
        prevAlerted: prev.length,
        toSend: toSend.length,
        sent,
        errors,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "check failed", store: store.name },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  }
}
