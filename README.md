# FotAlert

Live football dashboard that ranks in-progress matches by how far actual goals
diverge from expected goals (xG), with a **transparent provider health &
fallback layer**:

1. **FotMob** (primary, free/unofficial) — verified reachable from a Vercel
   datacenter IP (`iad1`, HTTP 200), so it serves live data + xG in production.
2. **Sportmonks** (optional paid fallback; enabled only if you set an API key)
   — an official, authenticated API that is datacenter-safe and provides xG.

Adding another provider (e.g. Hudl) is a single entry in the priority list —
the ranking and UI layers never change.

> A Sofascore adapter was prototyped and then removed: Sofascore hard-blocks
> datacenter IPs (`403 Forbidden` from `iad1`), so it is not a viable fallback
> for a deployed backend. The block-detection layer correctly classified it,
> which is exactly why it isn't shipped.

## Why this exists

FotMob cannot be assumed reachable from every deployed server — a datacenter IP
may be hard-blocked (HTTP 403 / anti-bot challenge). FotAlert **detects** that
condition, **classifies** it (temporary vs hard block), **stops hammering**,
enters a cooldown, and **falls back** to Sportmonks — while clearly labelling
which provider is live. When FotMob recovers, it automatically switches back
according to provider priority.

> This project **does not** implement any anti-bot bypass, proxy rotation,
> fingerprint spoofing or CAPTCHA circumvention. Blocks are detected, logged,
> and routed around via a legitimate fallback provider.

## Architecture

```
src/lib/
  types.ts            Normalized match model + health/status types
  config.ts           Env-driven configuration (server-side only)
  ranking.ts          Goals-vs-xG differential + sort (provider-agnostic)
  matching.ts         Cross-provider fixture matching + confidence score
  state.ts            Failure counts, cooldowns, last-success (anti-flap)
  orchestrator.ts     getLiveData(): selection, fallback, per-match xG fill
  health/classify.ts  AVAILABLE / TEMPORARY_FAILURE / BLOCKED / SCHEMA_FAILURE
  providers/
    provider.ts       LiveFootballProvider interface
    fotmob/           FotMobProvider (uses /api/data/*; xG extraction, status map)
    sportmonks/       SportmonksProvider (optional paid; xG via statistics include)
src/app/
  api/live            Ranked matches + provider status (server only)
  api/health          Lightweight provider health probe
  page.tsx            Dashboard (cards, provider panel, diagnostics)
```

### The normalized model

All calculation, ranking and UI code operates **only** on `NormalizedMatch` and
never knows which provider produced it. Every record retains provenance
(`sourceProvider`, `sourceMatchId`, `sourceLastUpdated`, `sourceUrl`).

### Ranking (identical for every provider)

```
homeDiff = homeGoals - homeXG
awayDiff = awayGoals - awayXG
overallDiff = abs(homeDiff) + abs(awayDiff)

sort: overallDiff DESC, then abs(homeXG - awayXG) DESC, then matchMinute DESC
```

Matches without standard team xG never get a fabricated differential and are
ranked last.

### xG integrity

The FotMob extractor searches stat groups by name/key and accepts **only**
standard *Expected goals (xG)*. It explicitly rejects xGoT, npxG, xPTS and other
derived metrics. If standard xG is missing, `xgAvailable = false`.

## Configuration

Copy `.env.example` to `.env.local`. **Secrets are read server-side only and are
never bundled to the client.**

| Variable | Default | Purpose |
| --- | --- | --- |
| `SPORTMONKS_API_KEY` | — | Optional paid provider token (not required) |
| `FOTMOB_ENABLED` | `true` | Toggle FotMob |
| `SPORTMONKS_ENABLED` | `true` | Toggle Sportmonks (needs a key to activate) |
| `AUTO_FALLBACK` | `true` | Enable automatic fallback/recovery |
| `FOTMOB_HEALTHCHECK_TIMEOUT_MS` | `5000` | Health probe timeout |
| `FOTMOB_BLOCK_COOLDOWN_SECONDS` | `900` | Cooldown after a hard block |
| `FOTMOB_FAILURE_THRESHOLD` | `3` | Transient failures before treated as down |
| `LIVE_REFRESH_SECONDS` | `60` | UI refresh cadence |

If every provider is unavailable the UI shows a controlled message
(e.g. `All data providers are currently unavailable.`) — the app never crashes.
FotMob is free and on by default, so the app works out of the box with no
configuration at all; add a Sportmonks key only if you want a paid, official
fallback for xG.

## Develop

```bash
npm install
npm run dev      # http://localhost:3000
npm test         # unit tests for ranking, classification, matching, xG
npm run build
```

## Provider status & diagnostics

The dashboard shows a **Data Providers** panel (status dot, last successful
fetch, latency, matches returned, cooldown) and an expandable **Developer
diagnostics** section (health, HTTP status, failure count, cooldown, block
reason). Diagnostics never expose API keys, auth headers or cookies.
