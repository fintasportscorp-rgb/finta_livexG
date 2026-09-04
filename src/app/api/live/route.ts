// ---------------------------------------------------------------------------
// Live data endpoint. Runs entirely on the server — provider secrets never
// reach the client. Returns the ranked normalized matches plus provider status.
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { getLiveData } from "@/lib/orchestrator";
import { rankMatches } from "@/lib/ranking";
import { mockMatch } from "@/lib/mock";
import { dispatchGoalOwedAlerts } from "@/lib/alerts/engine";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const data = await getLiveData();

    // Fire alerts for any real match that just crossed the owed threshold.
    // Fire-and-forget: alerting must never delay or break the live response.
    void dispatchGoalOwedAlerts(data.matches).catch(() => {});

    // ?demo=1 injects one synthetic match so the dashboard can be visualized
    // even when no real matches are live. Disabled in production (VERCEL_ENV
    // === "production") so demo mode is hidden from the live site; still usable
    // locally and on preview deployments.
    const allowDemo = process.env.VERCEL_ENV !== "production";
    const demo = allowDemo && new URL(request.url).searchParams.get("demo") === "1";
    if (demo) {
      const matches = rankMatches([mockMatch(), ...data.matches]);
      return NextResponse.json(
        {
          ...data,
          matches,
          notice: data.notice ?? "Demo match shown for visualization (not live data).",
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    // Never crash the app; surface a controlled error payload.
    const message = err instanceof Error ? err.message : "unexpected error";
    return NextResponse.json(
      {
        matches: [],
        activeProvider: null,
        fallbackActive: false,
        providerStatuses: [],
        notice: null,
        generatedAt: new Date().toISOString(),
        error: `Internal error while fetching live data: ${message}`,
      },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  }
}
