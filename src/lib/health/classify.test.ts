import { describe, expect, it } from "vitest";
import { classifyProbe, looksLikeChallengePage, type ProbeOutcome } from "./classify";

function outcome(p: Partial<ProbeOutcome>): ProbeOutcome {
  return {
    httpStatus: 200,
    timedOut: false,
    networkError: false,
    looksLikeChallenge: false,
    jsonValid: true,
    schemaValid: true,
    ...p,
  };
}

describe("classifyProbe", () => {
  it("marks 200 + valid schema as AVAILABLE", () => {
    expect(classifyProbe(outcome({})).status).toBe("AVAILABLE");
  });

  it("marks 403 as BLOCKED", () => {
    const c = classifyProbe(outcome({ httpStatus: 403, schemaValid: false, jsonValid: false }));
    expect(c.status).toBe("BLOCKED");
    expect(c.blocked).toBe(true);
  });

  it("treats challenge HTML as BLOCKED even on 200", () => {
    const c = classifyProbe(outcome({ looksLikeChallenge: true }));
    expect(c.status).toBe("BLOCKED");
  });

  it("classifies timeouts/DNS/5xx/429 as TEMPORARY_FAILURE", () => {
    expect(classifyProbe(outcome({ timedOut: true })).status).toBe("TEMPORARY_FAILURE");
    expect(classifyProbe(outcome({ networkError: true, httpStatus: null })).status).toBe(
      "TEMPORARY_FAILURE",
    );
    expect(classifyProbe(outcome({ httpStatus: 503, jsonValid: false })).status).toBe(
      "TEMPORARY_FAILURE",
    );
    expect(classifyProbe(outcome({ httpStatus: 429, jsonValid: false })).status).toBe(
      "TEMPORARY_FAILURE",
    );
  });

  it("classifies 200 with missing fields as SCHEMA_FAILURE", () => {
    expect(classifyProbe(outcome({ schemaValid: false })).status).toBe("SCHEMA_FAILURE");
    expect(classifyProbe(outcome({ jsonValid: false, schemaValid: false })).status).toBe(
      "SCHEMA_FAILURE",
    );
  });
});

describe("looksLikeChallengePage", () => {
  it("detects a Cloudflare-style challenge", () => {
    expect(
      looksLikeChallengePage("text/html", "<!DOCTYPE html><title>Just a moment...</title>"),
    ).toBe(true);
  });

  it("does not flag legit JSON", () => {
    expect(looksLikeChallengePage("application/json", '{"leagues":[]}')).toBe(false);
  });
});
