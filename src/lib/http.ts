// ---------------------------------------------------------------------------
// Small fetch helper with timeout + a normalized outcome shape used by health
// probes. Keeps concurrency conservative elsewhere; this only does one request.
// ---------------------------------------------------------------------------

export interface FetchResult {
  ok: boolean;
  httpStatus: number | null;
  contentType: string | null;
  body: string;
  timedOut: boolean;
  networkError: boolean;
  responseTimeMs: number;
}

export async function fetchWithTimeout(
  url: string,
  timeoutMs: number,
  init?: RequestInit,
): Promise<FetchResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();

  try {
    const res = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        // A plain, honest UA. We do NOT spoof fingerprints to evade anti-bot.
        "User-Agent": "FintaSpot/0.1 (+live-football-monitor)",
        ...(init?.headers ?? {}),
      },
      cache: "no-store",
    });

    const body = await res.text();
    return {
      ok: res.ok,
      httpStatus: res.status,
      contentType: res.headers.get("content-type"),
      body,
      timedOut: false,
      networkError: false,
      responseTimeMs: Date.now() - started,
    };
  } catch (err) {
    const timedOut = err instanceof Error && err.name === "AbortError";
    return {
      ok: false,
      httpStatus: null,
      contentType: null,
      body: "",
      timedOut,
      networkError: !timedOut,
      responseTimeMs: Date.now() - started,
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Parse JSON without throwing. */
export function tryParseJson(body: string): { ok: boolean; value: unknown } {
  try {
    return { ok: true, value: JSON.parse(body) };
  } catch {
    return { ok: false, value: null };
  }
}
