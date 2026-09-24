import { beforeEach, describe, expect, it, vi } from "vitest";
import { EXCLUSIONS_KEY } from "../src/config";
import { ExclusionStore } from "../src/state/exclusions";
import type { Candidate } from "../src/types";

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

    store.add(candidate);

    expect(store.has(42, "recieve")).toBe(true);
    expect(store.list()).toMatchObject([{
      key: "42:recieve",
      pageId: 42,
      title: "Quoted example",
      find: "recieve",
      replacement: "receive"
    }]);
  });

  it("migrates legacy keys and allows removal", () => {
    values.set(EXCLUSIONS_KEY, JSON.stringify(["73:occured"]));
    const store = new ExclusionStore();

    expect(store.has(73, "occured")).toBe(true);
    store.remove("73:occured");
    expect(store.list()).toEqual([]);
  });
});
