// ---------------------------------------------------------------------------
// Provider runtime state. In-memory, process-local. Tracks consecutive
// failures, hard-block cooldowns and last successful request so we can:
//   - avoid re-hammering a confirmed hard block (cooldown),
//   - avoid flapping on minor transient errors (failure thresholds),
//   - recover automatically once a provider is healthy again.
//
// State is intentionally immutable-updated: each transition returns a new record
// that replaces the stored one (no in-place mutation of the snapshot we read).
// ---------------------------------------------------------------------------

import type { ProviderId } from "./types";

export interface ProviderState {
  failureCount: number;
  cooldownUntil: number | null; // epoch ms; while set+future, skip this provider
  lastSuccessfulRequest: string | null; // ISO 8601
  lastBlockReason: string | null;
}

const initial = (): ProviderState => ({
  failureCount: 0,
  cooldownUntil: null,
  lastSuccessfulRequest: null,
  lastBlockReason: null,
});

// Module-level store. On serverless this is per-instance, which is fine: it is a
// best-effort guard, and each instance independently re-probes and recovers.
const store = new Map<ProviderId, ProviderState>();

export function getState(id: ProviderId): ProviderState {
  return store.get(id) ?? initial();
}

function set(id: ProviderId, next: ProviderState): ProviderState {
  store.set(id, next);
  return next;
}

export function recordSuccess(id: ProviderId): ProviderState {
  return set(id, {
    failureCount: 0,
    cooldownUntil: null,
    lastSuccessfulRequest: new Date().toISOString(),
    lastBlockReason: null,
  });
}

/** A transient failure: increment the counter but do not cool down. */
export function recordTemporaryFailure(id: ProviderId): ProviderState {
  const prev = getState(id);
  return set(id, { ...prev, failureCount: prev.failureCount + 1 });
}

/** A confirmed hard block: enter cooldown so we stop re-requesting. */
export function recordHardBlock(id: ProviderId, cooldownSeconds: number, reason: string): ProviderState {
  const prev = getState(id);
  return set(id, {
    ...prev,
    failureCount: prev.failureCount + 1,
    cooldownUntil: Date.now() + cooldownSeconds * 1000,
    lastBlockReason: reason,
  });
}

export function isInCooldown(id: ProviderId): boolean {
  const s = getState(id);
  return s.cooldownUntil !== null && s.cooldownUntil > Date.now();
}

export function cooldownRemainingSeconds(id: ProviderId): number {
  const s = getState(id);
  if (s.cooldownUntil === null) return 0;
  const remaining = Math.ceil((s.cooldownUntil - Date.now()) / 1000);
  return remaining > 0 ? remaining : 0;
}

/** True when consecutive failures have crossed the flap-prevention threshold. */
export function exceededFailureThreshold(id: ProviderId, threshold: number): boolean {
  return getState(id).failureCount >= threshold;
}

// Test helper — reset all state.
export function __resetStateForTests(): void {
  store.clear();
}
