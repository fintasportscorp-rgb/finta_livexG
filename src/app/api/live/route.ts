// ---------------------------------------------------------------------------
// Live data endpoint. Runs entirely on the server — provider secrets never
// reach the client. Returns the ranked normalized matches plus provider status.
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { getLiveData } from "@/lib/orchestrator";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const data = await getLiveData();
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
