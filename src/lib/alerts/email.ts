// ---------------------------------------------------------------------------
// Resend email delivery. Server-side only — the API key is never exposed to the
// client. We call the REST API directly (no SDK dependency).
// ---------------------------------------------------------------------------

import type { AppConfig } from "../config";
import type { RankedMatch } from "../types";

export interface SendResult {
  ok: boolean;
  id?: string;
  error?: string;
}

const RESEND_ENDPOINT = "https://api.resend.com/emails";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmt(n: number | null, digits = 2): string {
  return n === null ? "—" : n.toFixed(digits);
}

/** Build the alert email body for a match that has reached the owed threshold. */
export function buildAlertEmail(match: RankedMatch): { subject: string; html: string; text: string } {
  const home = escapeHtml(match.homeTeam);
  const away = escapeHtml(match.awayTeam);
  const owed = fmt(match.goalsOwed);
  const minute = match.matchMinute ?? "—";
  const remaining = match.remainingMinutes ?? "—";
  const comp = match.competition ? escapeHtml(match.competition) : "—";

  const homeXg = fmt(match.homeXG);
  const awayXg = fmt(match.awayXG);

  const subject = `⚽ Goal due: ${match.homeTeam} ${match.homeScore}-${match.awayScore} ${match.awayTeam} — ${owed} owed · xG ${homeXg}–${awayXg}`;

  const text = [
    `${match.homeTeam} ${match.homeScore}-${match.awayScore} ${match.awayTeam}`,
    `Goals owed (xG not yet converted): ${owed}`,
    `Current xG — ${match.homeTeam} (home): ${homeXg} · ${match.awayTeam} (away): ${awayXg}`,
    `Home: ${match.homeScore} goals on ${homeXg} xG (diff ${fmt(match.homeDiff)})`,
    `Away: ${match.awayScore} goals on ${awayXg} xG (diff ${fmt(match.awayDiff)})`,
    `Minute: ${minute}'  ·  ~${remaining}' left  ·  ${comp}`,
    `Source: ${match.sourceProvider}`,
    match.sourceUrl,
  ].join("\n");

  const html = `
  <div style="font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif;max-width:520px;margin:0 auto;color:#0b0f14">
    <h2 style="margin:0 0 4px">⚽ A goal is due</h2>
    <p style="margin:0 0 16px;color:#556">Finta Spot alert — a team has created well above what it has scored.</p>
    <div style="border:1px solid #e2e8f0;border-radius:12px;padding:16px">
      <div style="font-size:18px;font-weight:700;margin-bottom:10px">
        ${home} <span style="font-variant-numeric:tabular-nums">${match.homeScore}–${match.awayScore}</span> ${away}
      </div>
      <div style="font-size:32px;font-weight:800;color:#c0392b">${owed}</div>
      <div style="text-transform:uppercase;letter-spacing:.05em;font-size:11px;color:#889">goals owed</div>
      <div style="margin-top:12px">
        <span style="display:inline-block;font-size:13px;padding:5px 11px;border:1px solid #e2e8f0;border-radius:999px;margin:0 6px 6px 0">${home} xG <b>${homeXg}</b></span>
        <span style="display:inline-block;font-size:13px;padding:5px 11px;border:1px solid #e2e8f0;border-radius:999px;margin:0 6px 6px 0">${away} xG <b>${awayXg}</b></span>
      </div>
      <table style="width:100%;margin-top:8px;border-collapse:collapse;font-size:13px">
        <tr><td style="padding:4px 0">${home}</td><td style="text-align:right">${match.homeScore} goals · ${fmt(match.homeXG)} xG · diff ${fmt(match.homeDiff)}</td></tr>
        <tr><td style="padding:4px 0">${away}</td><td style="text-align:right">${match.awayScore} goals · ${fmt(match.awayXG)} xG · diff ${fmt(match.awayDiff)}</td></tr>
      </table>
      <p style="margin:14px 0 0;font-size:12px;color:#889">
        ${minute}' · ~${remaining}' left · ${comp} · source: ${escapeHtml(match.sourceProvider)}
      </p>
      <p style="margin:12px 0 0"><a href="${escapeHtml(match.sourceUrl)}" style="color:#2563eb">View match →</a></p>
    </div>
  </div>`;

  return { subject, html, text };
}

export async function sendGoalOwedEmail(cfg: AppConfig, match: RankedMatch): Promise<SendResult> {
  if (!cfg.resendApiKey) return { ok: false, error: "RESEND_API_KEY not configured" };

  const { subject, html, text } = buildAlertEmail(match);

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: cfg.alertFromEmail,
        to: [cfg.alertToEmail],
        subject,
        html,
        text,
      }),
    });

    const bodyText = await res.text();
    if (!res.ok) {
      return { ok: false, error: `Resend HTTP ${res.status}: ${bodyText.slice(0, 200)}` };
    }
    let id: string | undefined;
    try {
      id = (JSON.parse(bodyText) as { id?: string }).id;
    } catch {
      /* ignore */
    }
    return { ok: true, id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "email send failed" };
  }
}
