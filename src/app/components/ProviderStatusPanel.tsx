import type { HealthStatus, ProviderRuntimeStatus } from "@/lib/types";
import { fmtCooldown, fmtTimeAgo, providerLabel } from "./format";

function dotClass(status: HealthStatus): string {
  switch (status) {
    case "AVAILABLE":
      return "green";
    case "BLOCKED":
      return "red";
    case "TEMPORARY_FAILURE":
    case "SCHEMA_FAILURE":
      return "amber";
    default:
      return "grey";
  }
}

function statusText(p: ProviderRuntimeStatus): string {
  const h = p.health;
  if (h.status === "NOT_CONFIGURED" || (!p.configured && p.enabled)) return "Not configured";
  if (h.status === "DISABLED") return "Disabled";
  if (h.status === "AVAILABLE") return "Connected";
  if (h.status === "BLOCKED") return `Blocked${h.httpStatus ? ` (${h.httpStatus})` : ""}`;
  if (h.status === "TEMPORARY_FAILURE") return "Temporary failure";
  if (h.status === "SCHEMA_FAILURE") return "Schema mismatch";
  return h.status;
}

export function ProviderStatusPanel({ providers }: { providers: ProviderRuntimeStatus[] }) {
  return (
    <section className="providers">
      <h2>Data Providers</h2>
      {providers.map((p) => (
        <div className="prow" key={p.provider}>
          <div className="pname">
            <span className={`dot ${dotClass(p.health.status)}`} />
            {providerLabel(p.provider)} — {statusText(p)}
            {p.active ? <span className="active-badge">active</span> : null}
          </div>
          <div className="pmeta">
            <span>last ok: {fmtTimeAgo(p.health.lastSuccessfulRequest)}</span>
            <span>latency: {p.health.responseTimeMs !== null ? `${p.health.responseTimeMs}ms` : "—"}</span>
            <span>matches: {p.matchesReturned}</span>
            {p.cooldownRemainingSeconds > 0 ? (
              <span>cooldown: {fmtCooldown(p.cooldownRemainingSeconds)}</span>
            ) : null}
          </div>
        </div>
      ))}
    </section>
  );
}
