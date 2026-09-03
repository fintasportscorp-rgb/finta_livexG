import type { LiveDataResult } from "@/lib/types";
import { fmtCooldown, fmtTimeAgo, providerLabel } from "./format";

/**
 * Developer diagnostics. Expandable. NEVER exposes API keys, auth headers,
 * cookies or any sensitive request data — only health/status metadata.
 */
export function Diagnostics({ data }: { data: LiveDataResult }) {
  const lines: string[] = [];
  for (const p of data.providerStatuses) {
    const h = p.health;
    lines.push(`Provider: ${providerLabel(p.provider)}`);
    lines.push(`  Health: ${h.status}`);
    lines.push(`  HTTP status: ${h.httpStatus ?? "—"}`);
    lines.push(`  Latency: ${h.responseTimeMs !== null ? `${h.responseTimeMs}ms` : "—"}`);
    lines.push(`  Last successful request: ${fmtTimeAgo(h.lastSuccessfulRequest)}`);
    lines.push(`  Failure count: ${p.failureCount}`);
    lines.push(`  Cooldown: ${fmtCooldown(p.cooldownRemainingSeconds)}`);
    lines.push(`  Blocked: ${h.blocked ? "yes" : "no"}`);
    if (h.blockReason) lines.push(`  Reason: ${h.blockReason}`);
    lines.push(`  Enabled: ${p.enabled} · Configured: ${p.configured}`);
    lines.push("");
  }
  lines.push(`Active provider: ${data.activeProvider ? providerLabel(data.activeProvider) : "none"}`);
  lines.push(`Fallback active: ${data.fallbackActive ? "yes" : "no"}`);
  lines.push(`Generated at: ${data.generatedAt}`);

  return (
    <details className="diag">
      <summary>Developer diagnostics</summary>
      <pre>{lines.join("\n")}</pre>
    </details>
  );
}
