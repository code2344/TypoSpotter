import type { CommunityExclusionDocument, ExclusionEntry } from "../types";

const OPEN = '<syntaxhighlight lang="json">';
const CLOSE = "</syntaxhighlight>";

function isEntry(value: unknown): value is ExclusionEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<ExclusionEntry>;
  return typeof entry.key === "string" &&
    (entry.scope === "page" || entry.scope === "occurrence") &&
    typeof entry.pageId === "number" &&
    typeof entry.title === "string" &&
    typeof entry.ruleId === "string" &&
    typeof entry.find === "string" &&
    typeof entry.replacement === "string";
}

export function parseCommunityExclusions(wikitext: string): ExclusionEntry[] {
  if (!wikitext.trim()) return [];
  const start = wikitext.indexOf(OPEN);
  const end = wikitext.indexOf(CLOSE, start + OPEN.length);
  if (start < 0 || end < 0) throw new Error("The community exclusions page does not contain a TypoSpotter JSON block.");
  const document = JSON.parse(wikitext.slice(start + OPEN.length, end).trim()) as Partial<CommunityExclusionDocument>;
  if (document.version !== 1 || !Array.isArray(document.exclusions)) {
    throw new Error("The community exclusions page uses an unsupported format.");
  }
  return document.exclusions.filter(isEntry).map((entry) => ({ ...entry, pending: false }));
}

export function serializeCommunityExclusions(entries: ExclusionEntry[]): string {
  const document: CommunityExclusionDocument = {
    version: 1,
    exclusions: [...new Map(entries.map((entry) => [entry.key, { ...entry, pending: false }])).values()]
      .sort((left, right) => left.title.localeCompare(right.title) || left.key.localeCompare(right.key))
  };
  const json = JSON.stringify(document, null, 2)
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("&", "\\u0026");
  return `<!-- This data is maintained by TypoSpotter. Review changes in the page history. -->\n${OPEN}\n${json}\n${CLOSE}\n`;
}
