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

import { promises as fs } from "node:fs";
import path from "node:path";
import { loadConfig } from "../src/lib/config";
import { getLiveData } from "../src/lib/orchestrator";
import { rankMatches } from "../src/lib/ranking";
import { evaluateCrossings } from "../src/lib/alerts/engine";
import { sendGoalOwedEmail } from "../src/lib/alerts/email";
import type { LiveDataResult, RankedMatch } from "../src/lib/types";

const STATE_FILE = process.env.ALERT_STATE_FILE || ".alert-state/state.json";

async function loadState(): Promise<string[]> {
  try {
    const raw = await fs.readFile(STATE_FILE, "utf8");
    const parsed = JSON.parse(raw) as { alerted?: unknown };
    return Array.isArray(parsed.alerted) ? (parsed.alerted as string[]) : [];
  } catch {
    return []; // first run / no state yet
  }
}

async function saveState(alerted: string[]): Promise<void> {
  await fs.mkdir(path.dirname(STATE_FILE), { recursive: true });
  await fs.writeFile(
    STATE_FILE,
    JSON.stringify({ alerted, updatedAt: new Date().toISOString() }, null, 2),
  );
}

/** Prefer the deployed read endpoint (known-good FotMob egress) when provided. */
async function fetchMatches(): Promise<{ matches: RankedMatch[]; source: string }> {
  const siteUrl = process.env.SITE_URL?.replace(/\/$/, "");
  if (siteUrl) {
    const res = await fetch(`${siteUrl}/api/live`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`SITE_URL /api/live returned HTTP ${res.status}`);
    const data = (await res.json()) as LiveDataResult;
    return { matches: data.matches, source: `${siteUrl} (${data.activeProvider ?? "none"})` };
  }
  const data = await getLiveData();
  // getLiveData already ranks, but re-rank defensively in case shape changes.
  return { matches: rankMatches(data.matches), source: `direct (${data.activeProvider ?? "none"})` };
}

async function main(): Promise<void> {
  const cfg = loadConfig();
  const threshold = cfg.alertGoalsOwedThreshold;

  const prev = await loadState();
  const { matches, source } = await fetchMatches();
  const { toSend, alerted } = evaluateCrossings(matches, threshold, prev);

  console.log(
    `[alert-check] source=${source} matches=${matches.length} ` +
      `threshold=${threshold} prevAlerted=${prev.length} toSend=${toSend.length}`,
  );

  if (!cfg.alertsEnabled) {
    console.warn("[alert-check] alerts disabled (RESEND_API_KEY not set) — no emails sent.");
    await saveState(alerted);
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
  await saveState(alerted);
  console.log(`[alert-check] done. sent=${sent}/${toSend.length}`);
}

main().catch((err) => {
  console.error("[alert-check] fatal:", err);
  process.exit(1);
});
