// ---------------------------------------------------------------------------
// The provider selection & fallback engine.
//
// Providers are tried in priority order: FotMob → Sportmonks.
// The chain is data-driven, so adding a provider is just one array entry — the
// ranking, matching and UI layers never change.
//
//   getLiveData()
//     → probe health of every enabled+configured provider (respecting cooldowns)
//     → active = first provider in priority order that is AVAILABLE
//     → get active provider's live matches
//     → per match without xG: borrow xG from the next AVAILABLE provider in the
//       chain, but ONLY when fixture identity confidence is high enough.
//     → if no provider is available: controlled error, never a crash.
//
// Recovery: health is re-probed each call and cooldowns expire, so we
// automatically return to the highest-priority healthy provider (e.g. back to
// FotMob once it recovers). Failure thresholds + cooldowns prevent flapping.
// Provenance is always preserved; fallback data is never labelled as FotMob.
// ---------------------------------------------------------------------------

import type {
  LiveDataResult,
  NormalizedMatch,
  ProviderHealth,
  ProviderId,
  ProviderRuntimeStatus,
} from "./types";
import { loadConfig, type AppConfig } from "./config";
import type { LiveFootballProvider } from "./providers/provider";
import { rankMatches } from "./ranking";
import { findBestMatch } from "./matching";
import { FotMobProvider } from "./providers/fotmob";
import { SportmonksProvider } from "./providers/sportmonks";
import {
  cooldownRemainingSeconds,
  exceededFailureThreshold,
  getState,
  isInCooldown,
  recordHardBlock,
  recordSuccess,
  recordTemporaryFailure,
} from "./state";

// Priority order (index 0 = primary).
const PRIORITY: ProviderId[] = ["fotmob", "sportmonks"];

interface Entry {
  provider: LiveFootballProvider;
  enabled: boolean;
  configured: boolean;
  health: ProviderHealth;
  usable: boolean; // enabled, configured, not in cooldown, health AVAILABLE
}

function buildChain(cfg: AppConfig): Record<ProviderId, LiveFootballProvider> {
  return {
    fotmob: new FotMobProvider(cfg),
    sportmonks: new SportmonksProvider(cfg),
  };
}

function enabledFlag(id: ProviderId, cfg: AppConfig): boolean {
  if (id === "fotmob") return cfg.fotmobEnabled;
  return cfg.sportmonksEnabled;
}

/** Update state from a health result and return whether the provider is usable. */
function reconcileHealth(id: ProviderId, health: ProviderHealth, cfg: AppConfig): boolean {
  if (health.status === "AVAILABLE") {
    recordSuccess(id);
    return true;
  }
  if (health.blocked || health.status === "BLOCKED") {
    recordHardBlock(id, cfg.fotmobBlockCooldownSeconds, health.blockReason ?? "hard block");
    return false;
  }
  if (health.status === "TEMPORARY_FAILURE" || health.status === "SCHEMA_FAILURE") {
    recordTemporaryFailure(id);
  }
  return false;
}

export async function getLiveData(): Promise<LiveDataResult> {
  const cfg = loadConfig();
  const providers = buildChain(cfg);
  const generatedAt = new Date().toISOString();

  // ---- Probe every provider (in parallel), respecting cooldowns ----------
  const entries = await Promise.all(
    PRIORITY.map(async (id): Promise<[ProviderId, Entry]> => {
      const provider = providers[id];
      const enabled = enabledFlag(id, cfg);
      const configured = provider.isConfigured();

      if (!enabled) {
        return [id, mkEntry(provider, enabled, configured, disabledHealth(id, false), false)];
      }
      if (!configured) {
        return [id, mkEntry(provider, enabled, configured, notConfiguredHealth(id), false)];
      }
      if (isInCooldown(id)) {
        return [id, mkEntry(provider, enabled, configured, cooldownHealth(id), false)];
      }

      const health = await provider.getHealth().catch((e) => errorHealth(id, e));
      let usable = reconcileHealth(id, health, cfg);
      if (!usable && exceededFailureThreshold(id, cfg.fotmobFailureThreshold)) usable = false;
      return [id, mkEntry(provider, enabled, configured, health, usable)];
    }),
  );

  const byId = new Map<ProviderId, Entry>(entries);

  // ---- Pick the active provider = first usable in priority order ---------
  const activeId = PRIORITY.find((id) => byId.get(id)?.usable) ?? null;

  let matches: NormalizedMatch[] = [];
  let notice: string | null = null;
  let error: string | null = null;
  let fallbackActive = false;
  const counts = new Map<ProviderId, number>();

  if (activeId) {
    const primary = byId.get(activeId)!;
    matches = await primary.provider.getLiveMatches().catch(() => []);
    counts.set(activeId, matches.length);

    // Per-match xG fallback across the remaining AVAILABLE providers.
    const donors = PRIORITY.slice(PRIORITY.indexOf(activeId) + 1).filter((id) => byId.get(id)?.usable);
    if (cfg.autoFallback && donors.length > 0 && matches.some((m) => !m.xgAvailable)) {
      const filled = await fillMissingXg(matches, donors, byId, counts);
      matches = filled.matches;
      if (filled.filledCount > 0) fallbackActive = true;
    }

    // If the active provider is not the top-priority one, announce the fallback.
    if (activeId !== PRIORITY[0] && enabledFlag(PRIORITY[0], cfg)) {
      fallbackActive = true;
      notice = `FotMob unavailable — displaying live data from ${label(activeId)}.`;
    }
  } else {
    error = buildError(cfg, byId);
  }

  const ranked = rankMatches(matches);

  const providerStatuses: ProviderRuntimeStatus[] = PRIORITY.map((id) => {
    const e = byId.get(id)!;
    const st = getState(id);
    return {
      provider: id,
      enabled: e.enabled,
      configured: e.configured,
      health: { ...e.health, lastSuccessfulRequest: st.lastSuccessfulRequest },
      failureCount: st.failureCount,
      cooldownRemainingSeconds: cooldownRemainingSeconds(id),
      matchesReturned: counts.get(id) ?? 0,
      active: id === activeId,
    };
  });

  return {
    matches: ranked,
    activeProvider: activeId,
    fallbackActive,
    providerStatuses,
    notice,
    generatedAt,
    error,
  };
}

// ---------------------------------------------------------------------------

function mkEntry(
  provider: LiveFootballProvider,
  enabled: boolean,
  configured: boolean,
  health: ProviderHealth,
  usable: boolean,
): Entry {
  return { provider, enabled, configured, health, usable };
}

/**
 * For each match missing xG, find the same fixture in a donor provider's live
 * list (high-confidence identity match only) and copy its xG. Team/score/status
 * stay with the active provider; provenance still records the active source.
 */
async function fillMissingXg(
  matches: NormalizedMatch[],
  donors: ProviderId[],
  byId: Map<ProviderId, Entry>,
  counts: Map<ProviderId, number>,
): Promise<{ matches: NormalizedMatch[]; filledCount: number }> {
  // Fetch each donor's live matches once.
  const donorPools = new Map<ProviderId, NormalizedMatch[]>();
  for (const id of donors) {
    const pool = await byId.get(id)!.provider.getLiveMatches().catch(() => []);
    donorPools.set(id, pool);
    counts.set(id, pool.length);
  }

  let filledCount = 0;
  const out = matches.map((m) => {
    if (m.xgAvailable) return m;
    for (const id of donors) {
      const pool = donorPools.get(id) ?? [];
      const best = findBestMatch(m, pool);
      if (best && best.match.xgAvailable) {
        filledCount++;
        return {
          ...m,
          homeXG: best.match.homeXG,
          awayXG: best.match.awayXG,
          xgAvailable: true,
          // xG borrowed from another provider — reflect its freshness.
          sourceLastUpdated: best.match.sourceLastUpdated,
        };
      }
    }
    return m;
  });

  return { matches: out, filledCount };
}

function buildError(cfg: AppConfig, byId: Map<ProviderId, Entry>): string {
  const fotmob = byId.get("fotmob")!;
  const sportmonks = byId.get("sportmonks")!;
  const anyFallbackConfigured = sportmonks.enabled && sportmonks.configured;

  if (!fotmob.enabled && !anyFallbackConfigured) {
    return "No data provider is configured.";
  }
  if (fotmob.enabled && !fotmob.usable && !anyFallbackConfigured) {
    return "FotMob unavailable and no fallback provider configured.";
  }
  return "All data providers are currently unavailable.";
}

function label(id: ProviderId): string {
  if (id === "fotmob") return "FotMob";
  return "Sportmonks";
}

function disabledHealth(provider: ProviderId, enabled: boolean): ProviderHealth {
  return {
    provider,
    status: enabled ? "TEMPORARY_FAILURE" : "DISABLED",
    reachable: false,
    httpStatus: null,
    responseTimeMs: null,
    blocked: false,
    blockReason: enabled ? null : "disabled via configuration",
    lastSuccessfulRequest: getState(provider).lastSuccessfulRequest,
    checkedAt: new Date().toISOString(),
  };
}

function notConfiguredHealth(provider: ProviderId): ProviderHealth {
  return {
    provider,
    status: "NOT_CONFIGURED",
    reachable: false,
    httpStatus: null,
    responseTimeMs: null,
    blocked: false,
    blockReason: "provider not configured (missing API key)",
    lastSuccessfulRequest: getState(provider).lastSuccessfulRequest,
    checkedAt: new Date().toISOString(),
  };
}

function cooldownHealth(provider: ProviderId): ProviderHealth {
  const st = getState(provider);
  return {
    provider,
    status: "BLOCKED",
    reachable: false,
    httpStatus: null,
    responseTimeMs: null,
    blocked: true,
    blockReason: st.lastBlockReason ?? "in cooldown after hard block",
    lastSuccessfulRequest: st.lastSuccessfulRequest,
    checkedAt: new Date().toISOString(),
    detail: `cooldown active (${cooldownRemainingSeconds(provider)}s remaining)`,
  };
}

function errorHealth(provider: ProviderId, e: unknown): ProviderHealth {
  return {
    provider,
    status: "TEMPORARY_FAILURE",
    reachable: false,
    httpStatus: null,
    responseTimeMs: null,
    blocked: false,
    blockReason: e instanceof Error ? e.message : "probe failed",
    lastSuccessfulRequest: getState(provider).lastSuccessfulRequest,
    checkedAt: new Date().toISOString(),
  };
}
