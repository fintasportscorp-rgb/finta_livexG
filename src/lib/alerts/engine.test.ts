import { describe, expect, it } from "vitest";
import { decide, evaluateCrossings } from "./engine";
import type { RankedMatch } from "../types";

function ranked(partial: Partial<RankedMatch>): RankedMatch {
  const now = new Date().toISOString();
  return {
    provider: "fotmob",
    providerMatchId: "1",
    homeTeam: "Home",
    awayTeam: "Away",
    homeScore: 0,
    awayScore: 0,
    homeXG: 1.5,
    awayXG: 0,
    xgAvailable: true,
    matchMinute: 40,
    status: "live",
    lastUpdated: now,
    sourceProvider: "fotmob",
    sourceMatchId: "m1",
    sourceLastUpdated: now,
    sourceUrl: "",
    homeDiff: -1.5,
    awayDiff: 0,
    netXg: 1.5,
    goalsOwed: 1.5,
    remainingMinutes: 50,
    rankScore: 1,
    ...partial,
  };
}

const T = 1.1;

describe("decide", () => {
  it("sends on first crossing, then stays quiet while elevated", () => {
    expect(decide(false, 1.2, T)).toBe("send");
    expect(decide(true, 1.2, T)).toBe("noop");
    expect(decide(true, 1.15, T)).toBe("noop");
  });

  it("does not send below the threshold", () => {
    expect(decide(false, 1.05, T)).toBe("noop");
  });

  it("re-arms only after dropping below the clear band", () => {
    expect(decide(true, 0.9, T)).toBe("noop"); // 0.9 > 1.1-0.3=0.8 → still armed
    expect(decide(true, 0.5, T)).toBe("rearm");
  });

  it("noop when xG is unavailable", () => {
    expect(decide(false, null, T)).toBe("noop");
  });
});

describe("evaluateCrossings", () => {
  it("emails on first crossing and carries the state forward", () => {
    const m = ranked({ sourceMatchId: "a", netXg: 1.4 });
    const r1 = evaluateCrossings([m], T, []);
    expect(r1.toSend).toHaveLength(1);
    expect(r1.alerted).toContain("fotmob:a");

    // Same elevated match next run → no duplicate email.
    const r2 = evaluateCrossings([m], T, r1.alerted);
    expect(r2.toSend).toHaveLength(0);
  });

  it("re-alerts on a fresh crossing after it dropped and rose again", () => {
    const key = "fotmob:a";
    const high = ranked({ sourceMatchId: "a", netXg: 1.4 });
    const low = ranked({ sourceMatchId: "a", netXg: 0.4 });

    const afterFirst = evaluateCrossings([high], T, []).alerted;
    const afterDrop = evaluateCrossings([low], T, afterFirst).alerted;
    expect(afterDrop).not.toContain(key); // re-armed

    const r = evaluateCrossings([high], T, afterDrop);
    expect(r.toSend).toHaveLength(1); // alerts again
  });

  it("never alerts demo matches", () => {
    const r = evaluateCrossings([ranked({ netXg: 2, demo: true })], T, []);
    expect(r.toSend).toHaveLength(0);
  });

  it("tracks matches independently", () => {
    const a = ranked({ sourceMatchId: "a", netXg: 1.4 });
    const b = ranked({ sourceMatchId: "b", netXg: 1.4 });
    const r = evaluateCrossings([a, b], T, []);
    expect(r.toSend).toHaveLength(2);
    expect(r.alerted).toEqual(["fotmob:a", "fotmob:b"]);
  });
});
