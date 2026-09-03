import { describe, expect, it } from "vitest";
import { extractFotmobXG } from "./xg";

describe("extractFotmobXG", () => {
  it("finds standard xG regardless of array position", () => {
    const details = {
      content: {
        stats: {
          Periods: {
            All: {
              stats: [
                { title: "Ball possession", key: "possession", stats: [55, 45] },
                {
                  title: "Expected goals (xG)",
                  key: "expected_goals",
                  stats: ["1.83", "0.94"],
                },
              ],
            },
          },
        },
      },
    };
    const r = extractFotmobXG(details);
    expect(r.xgAvailable).toBe(true);
    expect(r.homeXG).toBeCloseTo(1.83);
    expect(r.awayXG).toBeCloseTo(0.94);
  });

  it("does NOT substitute xGoT for xG", () => {
    const details = {
      stats: [
        { title: "Expected goals on target (xGoT)", key: "expected_goals_on_target", stats: [2.1, 1.0] },
      ],
    };
    const r = extractFotmobXG(details);
    expect(r.xgAvailable).toBe(false);
    expect(r.homeXG).toBeNull();
  });

  it("does NOT substitute npxG for xG", () => {
    const details = {
      stats: [{ title: "Non-penalty xG", key: "non_penalty_expected_goals", stats: [1.0, 0.8] }],
    };
    expect(extractFotmobXG(details).xgAvailable).toBe(false);
  });

  it("marks unavailable when xG is absent", () => {
    const details = { stats: [{ title: "Shots", key: "shots", stats: [10, 8] }] };
    expect(extractFotmobXG(details).xgAvailable).toBe(false);
  });
});
