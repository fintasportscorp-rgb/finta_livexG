// ---------------------------------------------------------------------------
// Configuration loaded from environment variables. Read on the server only.
// Secrets (SPORTMONKS_API_KEY) must never be shipped to the client.
// ---------------------------------------------------------------------------

function boolEnv(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === "") return fallback;
  return value.toLowerCase() === "true" || value === "1";
}

function intEnv(value: string | undefined, fallback: number): number {
  if (value === undefined || value === "") return fallback;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

export interface AppConfig {
  fotmobEnabled: boolean;
  sportmonksEnabled: boolean;
  autoFallback: boolean;
  fotmobHealthcheckTimeoutMs: number;
  fotmobBlockCooldownSeconds: number;
  fotmobFailureThreshold: number;
  liveRefreshSeconds: number;
  sportmonksApiKey: string | null;
}

export function loadConfig(): AppConfig {
  const key = process.env.SPORTMONKS_API_KEY?.trim();
  return {
    fotmobEnabled: boolEnv(process.env.FOTMOB_ENABLED, true),
    sportmonksEnabled: boolEnv(process.env.SPORTMONKS_ENABLED, true),
    autoFallback: boolEnv(process.env.AUTO_FALLBACK, true),
    fotmobHealthcheckTimeoutMs: intEnv(process.env.FOTMOB_HEALTHCHECK_TIMEOUT_MS, 5000),
    fotmobBlockCooldownSeconds: intEnv(process.env.FOTMOB_BLOCK_COOLDOWN_SECONDS, 900),
    fotmobFailureThreshold: intEnv(process.env.FOTMOB_FAILURE_THRESHOLD, 3),
    liveRefreshSeconds: intEnv(process.env.LIVE_REFRESH_SECONDS, 60),
    sportmonksApiKey: key && key.length > 0 ? key : null,
  };
}

/** True when the Sportmonks fallback is enabled AND has a usable API key. */
export function sportmonksConfigured(cfg: AppConfig): boolean {
  return cfg.sportmonksEnabled && cfg.sportmonksApiKey !== null;
}
