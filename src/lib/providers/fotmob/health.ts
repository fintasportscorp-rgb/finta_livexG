// ---------------------------------------------------------------------------
// FotMob health probe. Lightweight: a single small request against a known
// endpoint from the real runtime environment. Tests DNS/TCP/TLS/HTTP, status,
// latency and whether expected JSON is returned — WITHOUT downloading many
// match pages.
// ---------------------------------------------------------------------------

import type { AppConfig } from "../../config";
import type { ProviderHealth } from "../../types";
import { fetchWithTimeout, tryParseJson } from "../../http";
import { classifyProbe, looksLikeChallengePage } from "../../health/classify";

const PROBE_URL = "https://www.fotmob.com/api/data/matches?date=" + probeDate();

function probeDate(): string {
  const d = new Date();
  return (
    d.getUTCFullYear().toString() +
    String(d.getUTCMonth() + 1).padStart(2, "0") +
    String(d.getUTCDate()).padStart(2, "0")
  );
}

export async function probeFotmobHealth(cfg: AppConfig): Promise<ProviderHealth> {
  const checkedAt = new Date().toISOString();

  if (!cfg.fotmobEnabled) {
    return baseHealth(checkedAt, {
      status: "DISABLED",
      reason: "FotMob disabled via configuration",
    });
  }

  const res = await fetchWithTimeout(PROBE_URL, cfg.fotmobHealthcheckTimeoutMs);

  const parsed = tryParseJson(res.body);
  const jsonValid = parsed.ok;
  const schemaValid =
    jsonValid &&
    typeof parsed.value === "object" &&
    parsed.value !== null &&
    "leagues" in (parsed.value as Record<string, unknown>);

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
    provider: "fotmob",
    status: classification.status,
    reachable: res.httpStatus !== null,
    httpStatus: res.httpStatus,
    responseTimeMs: res.responseTimeMs,
    blocked: classification.blocked,
    blockReason: classification.reason,
    lastSuccessfulRequest: null, // filled in by the state layer
    checkedAt,
    detail: classification.reason ?? undefined,
  };
}

function baseHealth(
  checkedAt: string,
  opts: { status: ProviderHealth["status"]; reason: string | null },
): ProviderHealth {
  return {
    provider: "fotmob",
    status: opts.status,
    reachable: false,
    httpStatus: null,
    responseTimeMs: null,
    blocked: false,
    blockReason: opts.reason,
    lastSuccessfulRequest: null,
    checkedAt,
    detail: opts.reason ?? undefined,
  };
}
