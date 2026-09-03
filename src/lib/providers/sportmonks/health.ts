// ---------------------------------------------------------------------------
// Sportmonks health probe. Lightweight call that also verifies the API key is
// accepted. The key is sent as an Authorization header (server-side only).
// ---------------------------------------------------------------------------

import type { AppConfig } from "../../config";
import type { ProviderHealth } from "../../types";
import { fetchWithTimeout, tryParseJson } from "../../http";
import { classifyProbe, looksLikeChallengePage } from "../../health/classify";

// A tiny endpoint: a single in-play page. Cheaper than pulling every fixture.
const PROBE_URL = "https://api.sportmonks.com/v3/football/livescores/inplay?per_page=1";

export async function probeSportmonksHealth(cfg: AppConfig): Promise<ProviderHealth> {
  const checkedAt = new Date().toISOString();

  if (!cfg.sportmonksEnabled) {
    return base(checkedAt, "DISABLED", "Sportmonks disabled via configuration");
  }
  if (cfg.sportmonksApiKey === null) {
    return base(checkedAt, "NOT_CONFIGURED", "SPORTMONKS_API_KEY not set");
  }

  const res = await fetchWithTimeout(PROBE_URL, cfg.fotmobHealthcheckTimeoutMs, {
    headers: { Authorization: cfg.sportmonksApiKey },
  });

  const parsed = tryParseJson(res.body);
  const jsonValid = parsed.ok;
  const schemaValid =
    jsonValid &&
    typeof parsed.value === "object" &&
    parsed.value !== null &&
    "data" in (parsed.value as Record<string, unknown>);

  const challenge = looksLikeChallengePage(res.contentType, res.body);
  const classification = classifyProbe({
    httpStatus: res.httpStatus,
    timedOut: res.timedOut,
    networkError: res.networkError,
    looksLikeChallenge: challenge,
    jsonValid,
    schemaValid,
  });

  return {
    provider: "sportmonks",
    status: classification.status,
    reachable: res.httpStatus !== null,
    httpStatus: res.httpStatus,
    responseTimeMs: res.responseTimeMs,
    blocked: classification.blocked,
    blockReason: classification.reason,
    lastSuccessfulRequest: null,
    checkedAt,
    detail: classification.reason ?? undefined,
  };
}

function base(
  checkedAt: string,
  status: ProviderHealth["status"],
  reason: string,
): ProviderHealth {
  return {
    provider: "sportmonks",
    status,
    reachable: false,
    httpStatus: null,
    responseTimeMs: null,
    blocked: false,
    blockReason: reason,
    lastSuccessfulRequest: null,
    checkedAt,
    detail: reason,
  };
}
