// ---------------------------------------------------------------------------
// Failure classification. Not every HTTP error is a permanent block. We map a
// probe outcome into one of the health statuses so the orchestrator can decide
// between retrying, cooling down, or falling back.
// ---------------------------------------------------------------------------

import type { HealthStatus } from "../types";

export interface ProbeOutcome {
  httpStatus: number | null;
  timedOut: boolean;
  networkError: boolean; // DNS failure, connection reset, TLS error, etc.
  looksLikeChallenge: boolean; // anti-bot / CAPTCHA HTML instead of JSON
  jsonValid: boolean; // body parsed as JSON
  schemaValid: boolean; // expected fields present
}

export interface Classification {
  status: HealthStatus;
  blocked: boolean;
  reason: string | null;
}

/**
 * Classify a single probe outcome.
 *
 * AVAILABLE          — 200 + valid expected JSON structure
 * TEMPORARY_FAILURE  — timeout, DNS/reset, 408, 429, 5xx
 * BLOCKED            — 403 (and repeated 401/403), anti-bot/challenge/CAPTCHA HTML
 * SCHEMA_FAILURE     — HTTP OK but expected fields missing
 */
export function classifyProbe(o: ProbeOutcome): Classification {
  if (o.timedOut) {
    return { status: "TEMPORARY_FAILURE", blocked: false, reason: "request timeout" };
  }
  if (o.networkError) {
    return {
      status: "TEMPORARY_FAILURE",
      blocked: false,
      reason: "network error (DNS/connection reset/TLS)",
    };
  }

  const code = o.httpStatus;

  // Anti-bot challenge served with any status → treat as a block.
  if (o.looksLikeChallenge) {
    return {
      status: "BLOCKED",
      blocked: true,
      reason: "anti-bot / challenge page returned instead of expected JSON",
    };
  }

  if (code === 403) {
    return {
      status: "BLOCKED",
      blocked: true,
      reason: "access denied / possible datacenter restriction (HTTP 403)",
    };
  }
  if (code === 401) {
    return {
      status: "BLOCKED",
      blocked: true,
      reason: "unauthorized (HTTP 401)",
    };
  }

  if (code === 408 || code === 429 || (code !== null && code >= 500 && code <= 599)) {
    return {
      status: "TEMPORARY_FAILURE",
      blocked: false,
      reason: `retryable HTTP status ${code}`,
    };
  }

  if (code !== null && code >= 200 && code < 300) {
    if (!o.jsonValid) {
      return {
        status: "SCHEMA_FAILURE",
        blocked: false,
        reason: "HTTP 200 but response body was not valid JSON",
      };
    }
    if (!o.schemaValid) {
      return {
        status: "SCHEMA_FAILURE",
        blocked: false,
        reason: "HTTP 200 but expected fields were missing",
      };
    }
    return { status: "AVAILABLE", blocked: false, reason: null };
  }

  // Any other 4xx we didn't special-case.
  if (code !== null && code >= 400 && code < 500) {
    return {
      status: "TEMPORARY_FAILURE",
      blocked: false,
      reason: `client error HTTP ${code}`,
    };
  }

  return {
    status: "TEMPORARY_FAILURE",
    blocked: false,
    reason: code === null ? "unknown failure" : `unexpected HTTP ${code}`,
  };
}

/**
 * Heuristic: does a response body look like an anti-bot / CAPTCHA challenge
 * page rather than an API JSON payload?
 */
export function looksLikeChallengePage(contentType: string | null, body: string): boolean {
  const ct = (contentType ?? "").toLowerCase();
  const isHtml = ct.includes("text/html") || /^\s*<!doctype html|^\s*<html/i.test(body);
  if (!isHtml) return false;

  const needles = [
    "captcha",
    "cf-challenge",
    "cf-browser-verification",
    "just a moment",
    "attention required",
    "access denied",
    "are you a human",
    "verify you are human",
    "__cf_chl",
    "px-captcha",
    "perimeterx",
    "datadome",
  ];
  const lower = body.slice(0, 4000).toLowerCase();
  return needles.some((n) => lower.includes(n));
}
