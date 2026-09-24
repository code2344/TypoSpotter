import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

describe("editSummary", () => {
  it("uses the required versioned format", async () => {
    const { editSummary } = await import("../src/config");
    expect(editSummary("recieve", "receive")).toBe(
      `Fix typo: "recieve" -> "receive" ([[User:SuperCode111/TypoSpotter|TS v${packageJson.version}]])`
    );
  });
});

describe("ignored titles", () => {
  it("always excludes the common misspellings article", async () => {
    const { isIgnoredTitle } = await import("../src/config");
    expect(isIgnoredTitle("Commonly misspelled English words")).toBe(true);
    expect(isIgnoredTitle("Ordinary article")).toBe(false);
  });
});
