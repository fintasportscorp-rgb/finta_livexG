// ---------------------------------------------------------------------------
// Provider health endpoint. Runs a lightweight probe of each provider without
// pulling full match lists. Server-side only.
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { loadConfig, sportmonksConfigured } from "@/lib/config";
import type { ProviderId } from "@/lib/types";
import { FotMobProvider } from "@/lib/providers/fotmob";
import { SportmonksProvider } from "@/lib/providers/sportmonks";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const cfg = loadConfig();
  const fotmob = new FotMobProvider(cfg);
  const sportmonks = new SportmonksProvider(cfg);

  const [fotmobHealth, sportmonksHealth] = await Promise.all([
    fotmob.getHealth().catch((e) => errorHealth("fotmob", e)),
    sportmonks.getHealth().catch((e) => errorHealth("sportmonks", e)),
  ]);

  return NextResponse.json(
    {
      checkedAt: new Date().toISOString(),
      sportmonksConfigured: sportmonksConfigured(cfg),
      providers: [fotmobHealth, sportmonksHealth],
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

function errorHealth(provider: ProviderId, e: unknown) {
  return {
    provider,
    status: "TEMPORARY_FAILURE" as const,
    reachable: false,
    httpStatus: null,
    responseTimeMs: null,
    blocked: false,
    blockReason: e instanceof Error ? e.message : "probe failed",
    lastSuccessfulRequest: null,
    checkedAt: new Date().toISOString(),
  };
}
