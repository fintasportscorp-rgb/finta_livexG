// ---------------------------------------------------------------------------
// Alert check endpoint. Intended to be hit by a Vercel Cron every minute so
// alerts fire even when no one has the dashboard open. Server-side only.
//
// If CRON_SECRET is set, the request must carry `Authorization: Bearer <secret>`
// (Vercel Cron sends this automatically), preventing public triggering / email
// spam. Without CRON_SECRET the endpoint is open (fine for local/dev).
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { getLiveData } from "@/lib/orchestrator";
import { dispatchGoalOwedAlerts } from "@/lib/alerts/engine";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const data = await getLiveData();
  const summary = await dispatchGoalOwedAlerts(data.matches);

  return NextResponse.json(
    {
      checkedAt: new Date().toISOString(),
      activeProvider: data.activeProvider,
      matchesEvaluated: summary.evaluated,
      alertsEnabled: summary.enabled,
      triggered: summary.triggered,
      sent: summary.sent,
      errors: summary.errors,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
