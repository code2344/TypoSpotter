import { beforeEach, describe, expect, it, vi } from "vitest";
import { EXCLUSIONS_KEY } from "../src/config";
import { ExclusionStore } from "../src/state/exclusions";
import type { Candidate, Occurrence, PageSnapshot } from "../src/types";

const values = new Map<string, string>();

beforeEach(() => {
  values.clear();
  vi.stubGlobal("mw", {
    storage: {
      get: (key: string) => values.get(key) ?? null,
      set: (key: string, value: string) => {
        values.set(key, value);
        return true;
      }
    }
  });
});

describe("ExclusionStore", () => {
  it("stores inspectable page and rule details", () => {
    const store = new ExclusionStore();
    const candidate: Candidate = {
      pageId: 42,
      title: "Quoted example",
      rule: { id: "recieve", find: "recieve", replace: "receive", note: "test" }
    };

    const text = "The archived letter says I did not recieve it.";
    const start = text.indexOf("recieve");
    const occurrence: Occurrence = {
      id: "recieve:35", start, end: start + 7, matched: "recieve", replacement: "receive",
      before: text.slice(0, start), after: text.slice(start + 7)
    };
    const snapshot: PageSnapshot = {
      pageId: 42, title: candidate.title, revisionId: 100, baseTimestamp: "", startTimestamp: "",
      contentModel: "wikitext", text
    };

    store.addOccurrence(candidate, snapshot, occurrence, "Direct quotation");

    expect(store.list()).toMatchObject([{
      scope: "occurrence",
      pageId: 42,
      title: "Quoted example",
      find: "recieve",
      replacement: "receive",
      revisionId: 100,
      lineNumber: 1,
      reason: "Direct quotation",
      pending: true
    }]);
    expect(store.filter(candidate, snapshot, [occurrence])).toEqual([]);

    const movedSnapshot = { ...snapshot, revisionId: 101, text: `New heading\n${text}` };
    const movedOccurrence = {
      ...occurrence,
      id: "recieve:47",
      start: occurrence.start + 12,
      end: occurrence.end + 12
    };
    expect(store.filter(candidate, movedSnapshot, [movedOccurrence])).toEqual([]);

    const ambiguous = { ...movedOccurrence, id: "recieve:99", start: 99, end: 106 };
    expect(store.filter(candidate, movedSnapshot, [movedOccurrence, ambiguous])).toHaveLength(2);
  });

  it("migrates legacy keys and allows removal", () => {
    values.set(EXCLUSIONS_KEY, JSON.stringify(["73:occured"]));
    const store = new ExclusionStore();

    expect(store.hasPageRule(73, "occured")).toBe(true);
    store.remove("73:occured");
    expect(store.list()).toEqual([]);
  });
});
