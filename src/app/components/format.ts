// Small formatting helpers shared by UI components.

export function fmtXg(v: number | null): string {
  return v === null ? "—" : v.toFixed(2);
}

export function fmtDiff(v: number | null): string {
  if (v === null) return "—";
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(2)}`;
}

export function fmtMinute(minute: number | null, status: string): string {
  if (status === "halftime") return "HT";
  if (status === "finished") return "FT";
  if (minute === null) return status.toUpperCase();
  return `${minute}'`;
}

/** Exact local wall-clock datetime, e.g. "2026-09-04 14:32:07". */
export function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "unknown";
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
}

export function fmtTimeAgo(iso: string | null): string {
  if (!iso) return "never";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "unknown";
  const secs = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ${secs % 60}s ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m ago`;
}

export function fmtCooldown(secs: number): string {
  if (secs <= 0) return "—";
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}m ${String(s).padStart(2, "0")}s`;
}

export function providerLabel(id: string): string {
  if (id === "fotmob") return "FotMob";
  if (id === "sportmonks") return "Sportmonks";
  return id;
}
