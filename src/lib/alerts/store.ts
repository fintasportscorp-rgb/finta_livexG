// ---------------------------------------------------------------------------
// Persisted alert de-dup state. Backed by Upstash Redis (REST) when configured
// — a single shared source of truth so the Vercel endpoint (cron-job.org) and
// the GitHub Actions fallback never double-send. Falls back to in-memory (Vercel
// endpoint) or a file (script) when Upstash env vars aren't set.
//
// State is the set of match keys currently in the "already alerted" state,
// stored as one JSON array under a single key with a TTL so finished matches
// auto-expire.
// ---------------------------------------------------------------------------

import { promises as fs } from "node:fs";
import path from "node:path";

export interface AlertStore {
  readonly name: string;
  load(): Promise<string[]>;
  save(alerted: string[]): Promise<void>;
}

const KEY = "finta:alerted";
const TTL_SECONDS = 6 * 60 * 60; // 6h — finished matches drop out on their own

export function upstashConfigured(): boolean {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

async function redis(command: (string | number)[]): Promise<unknown> {
  const url = process.env.UPSTASH_REDIS_REST_URL!;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN!;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(command),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Upstash HTTP ${res.status}`);
  const json = (await res.json()) as { result?: unknown; error?: string };
  if (json.error) throw new Error(`Upstash error: ${json.error}`);
  return json.result;
}

export function upstashStore(): AlertStore | null {
  if (!upstashConfigured()) return null;
  return {
    name: "upstash",
    async load() {
      const raw = (await redis(["GET", KEY])) as string | null;
      if (!raw) return [];
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? (parsed as string[]) : [];
      } catch {
        return [];
      }
    },
    async save(alerted) {
      await redis(["SET", KEY, JSON.stringify(alerted), "EX", TTL_SECONDS]);
    },
  };
}

// Ephemeral, process-local — used by the Vercel endpoint if Upstash is absent.
const mem = new Set<string>();
export function memoryStore(): AlertStore {
  return {
    name: "memory",
    async load() {
      return [...mem];
    },
    async save(alerted) {
      mem.clear();
      for (const k of alerted) mem.add(k);
    },
  };
}

export function fileStore(filePath: string): AlertStore {
  return {
    name: `file(${filePath})`,
    async load() {
      try {
        const raw = await fs.readFile(filePath, "utf8");
        const parsed = JSON.parse(raw) as { alerted?: unknown };
        return Array.isArray(parsed.alerted) ? (parsed.alerted as string[]) : [];
      } catch {
        return [];
      }
    },
    async save(alerted) {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, JSON.stringify({ alerted, updatedAt: new Date().toISOString() }, null, 2));
    },
  };
}
