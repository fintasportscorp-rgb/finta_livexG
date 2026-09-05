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

function floatEnv(value: string | undefined, fallback: number): number {
  if (value === undefined || value === "") return fallback;
  const n = Number.parseFloat(value);
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

  // Email alerts (Resend). Secrets read server-side only.
  alertsEnabled: boolean;
  resendApiKey: string | null;
  alertToEmail: string;
  alertFromEmail: string;
  alertGoalsOwedThreshold: number;
}

export function loadConfig(): AppConfig {
  const key = process.env.SPORTMONKS_API_KEY?.trim();
  const resendKey = process.env.RESEND_API_KEY?.trim() || null;
  return {
    fotmobEnabled: boolEnv(process.env.FOTMOB_ENABLED, true),
    sportmonksEnabled: boolEnv(process.env.SPORTMONKS_ENABLED, true),
    autoFallback: boolEnv(process.env.AUTO_FALLBACK, true),
    fotmobHealthcheckTimeoutMs: intEnv(process.env.FOTMOB_HEALTHCHECK_TIMEOUT_MS, 5000),
    fotmobBlockCooldownSeconds: intEnv(process.env.FOTMOB_BLOCK_COOLDOWN_SECONDS, 900),
    fotmobFailureThreshold: intEnv(process.env.FOTMOB_FAILURE_THRESHOLD, 3),
    liveRefreshSeconds: intEnv(process.env.LIVE_REFRESH_SECONDS, 60),
    sportmonksApiKey: key && key.length > 0 ? key : null,

    // Alerts require a Resend key; enabled by default when one is present.
    alertsEnabled: boolEnv(process.env.ALERTS_ENABLED, true) && resendKey !== null,
    resendApiKey: resendKey,
    // Default to the Resend account address, which is the only recipient that
    // works before a domain is verified. Override with ALERT_TO_EMAIL once a
    // domain is set up (e.g. finta.sports.corp@gmail.com).
    alertToEmail: process.env.ALERT_TO_EMAIL?.trim() || "vistao.sports@gmail.com",
    alertFromEmail: process.env.ALERT_FROM_EMAIL?.trim() || "Finta Spot <onboarding@resend.dev>",
    alertGoalsOwedThreshold: floatEnv(process.env.ALERT_GOALS_OWED_THRESHOLD, 1.1),
  };
}

/** True when the Sportmonks fallback is enabled AND has a usable API key. */
export function sportmonksConfigured(cfg: AppConfig): boolean {
  return cfg.sportmonksEnabled && cfg.sportmonksApiKey !== null;
}
