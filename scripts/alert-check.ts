// ---------------------------------------------------------------------------
// Standalone alert check, run on a schedule by GitHub Actions (free) instead of
// a Vercel cron. It reuses the app's own provider + ranking code, evaluates
// threshold crossings against a PERSISTED state file (so de-dup survives across
// runs), and sends emails via Resend.
//
//   1. Load previous "already alerted" state from ALERT_STATE_FILE.
//   2. Fetch live matches — from the deployed site if SITE_URL is set, else
//      directly via getLiveData() (fetches FotMob from the runner).
//   3. evaluateCrossings() → matches that newly crossed the threshold.
//   4. Send an email for each; write the new state back.
//
// Run: `npx tsx scripts/alert-check.ts`
// ---------------------------------------------------------------------------

import { loadConfig } from "../src/lib/config";
import { getLiveData } from "../src/lib/orchestrator";
import { rankMatches } from "../src/lib/ranking";
import { evaluateCrossings } from "../src/lib/alerts/engine";
import { sendGoalOwedEmail } from "../src/lib/alerts/email";
import { fileStore, upstashStore } from "../src/lib/alerts/store";
import type { LiveDataResult, RankedMatch } from "../src/lib/types";

const STATE_FILE = process.env.ALERT_STATE_FILE || ".alert-state/state.json";

// Share Upstash with the Vercel endpoint when configured; else a local file.
const store = upstashStore() ?? fileStore(STATE_FILE);

/** Add https:// when the scheme is missing; strip a trailing slash. */
function normalizeSiteUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  let u = raw.trim().replace(/\/+$/, "");
  if (!u) return null;
  if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
  return u;
}

/**
 * Prefer the deployed read endpoint (known-good FotMob egress) when provided,
 * but NEVER let a bad SITE_URL kill alerting: on any failure, fall back to
 * fetching FotMob directly. Metrics are always recomputed locally.
 */
async function fetchMatches(): Promise<{ matches: RankedMatch[]; source: string }> {
  const siteUrl = normalizeSiteUrl(process.env.SITE_URL);
  if (siteUrl) {
    try {
      const res = await fetch(`${siteUrl}/api/live`, { headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as LiveDataResult;
      return { matches: rankMatches(data.matches), source: siteUrl };
    } catch (e) {
      console.warn(
        `[alert-check] SITE_URL fetch failed (${e instanceof Error ? e.message : e}); ` +
          `falling back to direct FotMob.`,
      );
    }
  }
  const data = await getLiveData();
  return { matches: rankMatches(data.matches), source: `direct (${data.activeProvider ?? "none"})` };
}

async function main(): Promise<void> {
  const cfg = loadConfig();
  const threshold = cfg.alertGoalsOwedThreshold;

  const prev = await store.load();
  const { matches, source } = await fetchMatches();
  const { toSend, alerted } = evaluateCrossings(matches, threshold, prev);

  // Self-diagnostic line so a workflow run shows why it did/didn't send.
  console.log(
    `[alert-check] key=${cfg.resendApiKey ? "set" : "MISSING"} to=${cfg.alertToEmail} ` +
      `store=${store.name} source=${source} matches=${matches.length} threshold=${threshold} ` +
      `prevAlerted=${prev.length} toSend=${toSend.length}`,
  );

  if (!cfg.alertsEnabled) {
    console.warn("[alert-check] alerts disabled (RESEND_API_KEY not set) — no emails sent.");
    await store.save(alerted);
    return;
  }

  let sent = 0;
  for (const m of toSend) {
    const r = await sendGoalOwedEmail(cfg, m);
    if (r.ok) {
      sent += 1;
      console.log(
        `[alert-check] sent: ${m.homeTeam} ${m.homeScore}-${m.awayScore} ${m.awayTeam} ` +
          `owed=${m.goalsOwed?.toFixed(2)} id=${r.id ?? "?"}`,
      );
    } else {
      console.error(`[alert-check] FAILED: ${m.homeTeam} v ${m.awayTeam}: ${r.error}`);
    }
  }

  // Persist even on partial failure so we don't re-spam matches that did send.
  await store.save(alerted);
  console.log(`[alert-check] done. sent=${sent}/${toSend.length}`);
}

main().catch((err) => {
  console.error("[alert-check] fatal:", err);
  process.exit(1);
});
