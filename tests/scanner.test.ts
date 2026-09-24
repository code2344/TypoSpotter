import { describe, expect, it } from "vitest";
import type { TypoRule } from "../src/types";
import { applyOccurrences } from "../src/wikitext/proposal";
import { findOccurrences, preserveCase } from "../src/wikitext/scanner";

const rule: TypoRule = {
  id: "recieve",
  find: "recieve",
  replace: "receive",
  note: "test"
};

describe("findOccurrences", () => {
  it("finds ordinary prose and preserves simple case", () => {
    const text = "They recieve mail. Recieve this. RECIEVE that.";
    const occurrences = findOccurrences(text, rule);
    expect(occurrences.map((item) => item.replacement)).toEqual(["receive", "Receive", "RECEIVE"]);
  });

  it("does not match inside another word", () => {
    expect(findOccurrences("prerecievepost", rule)).toHaveLength(0);
  });

  it("excludes templates, links, comments, refs, literal tags, URLs, and tables", () => {
    const text = [
      "Visible recieve.",
      "{{cite web|title=recieve}}",
      "[[recieve|recieve]]",
      "<!-- recieve -->",
      "<ref>recieve</ref>",
      "<nowiki>recieve</nowiki>",
      "https://example.test/recieve",
      "{| class=wikitable\n| recieve\n|}"
    ].join("\n");
    const occurrences = findOccurrences(text, rule);
    expect(occurrences).toHaveLength(1);
    expect(occurrences[0]?.matched).toBe("recieve");
  });

  it("protects the remainder after an unclosed template", () => {
    expect(findOccurrences("Visible recieve. {{ broken recieve", rule)).toHaveLength(1);
  });
});

describe("applyOccurrences", () => {
  it("changes only selected occurrences", () => {
    const text = "recieve one and recieve two";
    const occurrences = findOccurrences(text, rule);
    const selected = new Set([occurrences[1]!.id]);
    expect(applyOccurrences(text, occurrences, selected)).toBe("recieve one and receive two");
  });

  it("returns byte-identical text when nothing is selected", () => {
    const text = "A recieve with {{unusual|spacing = yes}}.";
    expect(applyOccurrences(text, findOccurrences(text, rule), new Set())).toBe(text);
  });
});

describe("preserveCase", () => {
  it("handles lower, title, and upper case", () => {
    expect(preserveCase("recieve", "receive")).toBe("receive");
    expect(preserveCase("Recieve", "receive")).toBe("Receive");
    expect(preserveCase("RECIEVE", "receive")).toBe("RECEIVE");
  });
});
