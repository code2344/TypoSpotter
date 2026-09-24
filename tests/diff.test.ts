import { describe, expect, it } from "vitest";
import { buildLocalDiff, changedSegments } from "../src/diff/local";

describe("local diff", () => {
  it("includes every changed line with surrounding context", () => {
    const original = "Intro\nFirst recieve\nMiddle\nSecond recieve\nEnd";
    const proposed = "Intro\nFirst receive\nMiddle\nSecond receive\nEnd";
    const rows = buildLocalDiff(original, proposed);
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.lineNumber)).toEqual([2, 4]);
    expect(rows[0]?.beforeContext).toEqual(["Intro"]);
    expect(rows[0]?.afterContext).toEqual(["Middle", "Second recieve"]);
  });

  it("isolates the changed spelling", () => {
    expect(changedSegments("The letter was recieve today", "The letter was receive today")).toEqual({
      prefix: "The letter was rec",
      original: "ie",
      proposed: "ei",
      suffix: "ve today"
    });
  });
});
