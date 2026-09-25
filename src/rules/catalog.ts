import type { TypoRule } from "../types";

// These are intentionally straightforward misspellings. Context-sensitive word
// pairs (their/there, affect/effect, regional variants, and names) do not belong
// in the starter catalog.
export const RULES: TypoRule[] = [
  { id: "recieve", find: "recieve", replace: "receive", note: "Common letter transposition" },
  { id: "seperate", find: "seperate", replace: "separate", note: "Common misspelling" },
  { id: "definately", find: "definately", replace: "definitely", note: "Common misspelling" },
  { id: "occured", find: "occured", replace: "occurred", note: "Missing doubled consonant" },
  { id: "untill", find: "untill", replace: "until", note: "Extra final consonant" },
  { id: "accomodate", find: "accomodate", replace: "accommodate", note: "Missing doubled consonant" },
  { id: "begining", find: "begining", replace: "beginning", note: "Missing doubled consonant" },
  { id: "existance", find: "existance", replace: "existence", note: "Common misspelling" },
  { id: "goverment", find: "goverment", replace: "government", note: "Missing letter" },
  { id: "independant", find: "independant", replace: "independent", note: "Common misspelling" },
  { id: "maintainance", find: "maintainance", replace: "maintenance", note: "Common misspelling" },
  { id: "neccessary", find: "neccessary", replace: "necessary", note: "Incorrect doubled consonant" },
  { id: "posession", find: "posession", replace: "possession", note: "Missing doubled consonant" },
  { id: "prefered", find: "prefered", replace: "preferred", note: "Missing doubled consonant" },
  { id: "publically", find: "publically", replace: "publicly", note: "Common misspelling" },
  { id: "refering", find: "refering", replace: "referring", note: "Missing doubled consonant" },
  { id: "succesful", find: "succesful", replace: "successful", note: "Missing doubled consonant" },
  { id: "tommorow", find: "tommorow", replace: "tomorrow", note: "Common misspelling" },
  { id: "wierd", find: "wierd", replace: "weird", note: "Common letter transposition" },
  { id: "withold", find: "withold", replace: "withhold", note: "Missing letter" }
];

const ATTRIBUTE = /([A-Za-z]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

function decode(value: string): string {
  return value.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

/** Parse the XML format used by Wikipedia:AutoWikiBrowser/Typos. */
export function parseAwbTypos(xml: string): TypoRule[] {
  const rules: TypoRule[] = [];
  const seen = new Set<string>();
  for (const match of xml.matchAll(/<Typo\b([^>]*?)(?:\/?>)/gi)) {
    const attributes: Record<string, string> = {};
    for (const attribute of (match[1] ?? "").matchAll(ATTRIBUTE)) {
      const name = attribute[1];
      if (name) attributes[name.toLowerCase()] = decode(attribute[2] ?? attribute[3] ?? "");
    }
    const find = attributes.find;
    const replace = attributes.replace;
    if (!find || replace === undefined || attributes.disabled !== undefined) continue;
    const id = `awb:${find}\u0000${replace}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const search = find.replace(/\\[bB]|\\p\{[^}]+\}|[^\p{L}\p{N}' -]/gu, " ").trim().split(/\s+/u)[0];
    if (!search) continue;
    rules.push({ id, find, replace, note: attributes.word || "AutoWikiBrowser typo rule", regex: true, search });
  }
  return rules;
}
