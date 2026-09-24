import { describe, expect, it } from "vitest";
import { parseCommunityExclusions, serializeCommunityExclusions } from "../src/state/community";
import type { ExclusionEntry } from "../src/types";

describe("community exclusion document", () => {
  it("round-trips entries while neutralizing syntax-highlight terminators", () => {
    const entry: ExclusionEntry = {
      key: "42:recieve:fnv1a:12345678",
      scope: "occurrence",
      pageId: 42,
      title: "Quoted example",
      ruleId: "recieve",
      find: "recieve",
      replacement: "receive",
      revisionId: 100,
      lineNumber: 3,
      matched: "recieve",
      before: "text </syntaxhighlight> before",
      after: "after",
      contextHash: "fnv1a:12345678",
      reason: "Direct quotation",
      createdAt: "2026-09-25T00:00:00.000Z",
      pending: true
    };

    const serialized = serializeCommunityExclusions([entry]);
    expect(serialized.match(/<\/syntaxhighlight>/g)).toHaveLength(1);
    expect(parseCommunityExclusions(serialized)).toMatchObject([{ key: entry.key, pending: false }]);
  });

  it("accepts an empty page as a new registry", () => {
    expect(parseCommunityExclusions("  ")).toEqual([]);
  });
});
