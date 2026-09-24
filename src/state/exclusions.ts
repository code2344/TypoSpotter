import { EXCLUSIONS_KEY } from "../config";
import type { Candidate, ExclusionEntry, Occurrence, PageSnapshot } from "../types";

const CONTEXT_LENGTH = 160;

function normalizeContext(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
}

function fnv1a(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function occurrenceAnchor(occurrence: Occurrence): Pick<ExclusionEntry, "before" | "after" | "contextHash"> {
  const before = normalizeContext(occurrence.before.slice(-CONTEXT_LENGTH));
  const after = normalizeContext(occurrence.after.slice(0, CONTEXT_LENGTH));
  return {
    before,
    after,
    contextHash: fnv1a(`${before}\u241f${occurrence.matched.toLowerCase()}\u241f${after}`)
  };
}

export function occurrenceLine(text: string, occurrence: Occurrence): number {
  return text.slice(0, occurrence.start).split("\n").length;
}

export function exclusionMatches(entry: ExclusionEntry, candidate: Candidate, snapshot: PageSnapshot, occurrence: Occurrence): boolean {
  if (entry.pageId !== candidate.pageId || entry.ruleId !== candidate.rule.id) return false;
  if (entry.scope === "page") return true;
  const anchor = occurrenceAnchor(occurrence);
  if (!entry.contextHash || anchor.contextHash !== entry.contextHash ||
      anchor.before !== entry.before || anchor.after !== entry.after) return false;
  if (entry.revisionId === snapshot.revisionId) {
    return entry.lineNumber === occurrenceLine(snapshot.text, occurrence) &&
      entry.matched?.toLowerCase() === occurrence.matched.toLowerCase();
  }
  return true;
}

function validEntry(item: unknown): ExclusionEntry | undefined {
  if (!item || typeof item !== "object") return undefined;
  const entry = item as Partial<ExclusionEntry>;
  if (typeof entry.key !== "string" || typeof entry.pageId !== "number" ||
      typeof entry.ruleId !== "string" || typeof entry.title !== "string") return undefined;
  return {
    key: entry.key,
    scope: entry.scope === "occurrence" ? "occurrence" : "page",
    pageId: entry.pageId,
    title: entry.title,
    ruleId: entry.ruleId,
    find: typeof entry.find === "string" ? entry.find : entry.ruleId,
    replacement: typeof entry.replacement === "string" ? entry.replacement : "",
    revisionId: typeof entry.revisionId === "number" ? entry.revisionId : undefined,
    lineNumber: typeof entry.lineNumber === "number" ? entry.lineNumber : undefined,
    matched: typeof entry.matched === "string" ? entry.matched : undefined,
    before: typeof entry.before === "string" ? entry.before : undefined,
    after: typeof entry.after === "string" ? entry.after : undefined,
    contextHash: typeof entry.contextHash === "string" ? entry.contextHash : undefined,
    reason: typeof entry.reason === "string" ? entry.reason : undefined,
    createdAt: typeof entry.createdAt === "string" ? entry.createdAt : "",
    pending: entry.pending === true
  };
}

export class ExclusionStore {
  private values: Map<string, ExclusionEntry>;

  constructor() {
    this.values = new Map(this.read().map((entry) => [entry.key, entry]));
  }

  private read(): ExclusionEntry[] {
    try {
      const raw = mw.storage?.get(EXCLUSIONS_KEY) ?? localStorage.getItem(EXCLUSIONS_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(parsed)) return [];
      return parsed.flatMap((item): ExclusionEntry[] => {
        if (typeof item === "string") {
          const [pageIdText, ruleId = "unknown"] = item.split(":", 2);
          const pageId = Number(pageIdText);
          if (!Number.isInteger(pageId)) return [];
          return [{ key: item, scope: "page", pageId, title: `Page ${pageId}`, ruleId, find: ruleId, replacement: "", createdAt: "", pending: false }];
        }
        const entry = validEntry(item);
        return entry ? [entry] : [];
      });
    } catch {
      return [];
    }
  }

  private write(): void {
    const raw = JSON.stringify(this.list());
    if (mw.storage) mw.storage.set(EXCLUSIONS_KEY, raw);
    else localStorage.setItem(EXCLUSIONS_KEY, raw);
  }

  addOccurrence(candidate: Candidate, snapshot: PageSnapshot, occurrence: Occurrence, reason = ""): ExclusionEntry {
    const anchor = occurrenceAnchor(occurrence);
    const key = `${candidate.pageId}:${candidate.rule.id}:${anchor.contextHash}`;
    const entry: ExclusionEntry = {
      key, scope: "occurrence", pageId: candidate.pageId, title: candidate.title,
      ruleId: candidate.rule.id, find: candidate.rule.find, replacement: candidate.rule.replace,
      revisionId: snapshot.revisionId, lineNumber: occurrenceLine(snapshot.text, occurrence),
      matched: occurrence.matched, before: anchor.before, after: anchor.after,
      contextHash: anchor.contextHash, reason, createdAt: new Date().toISOString(), pending: true
    };
    this.values.set(key, entry);
    this.write();
    return entry;
  }

  filter(candidate: Candidate, snapshot: PageSnapshot, occurrences: Occurrence[], community: ExclusionEntry[] = []): Occurrence[] {
    const exclusions = [...this.values.values(), ...community];
    return occurrences.filter((occurrence) => !exclusions.some((entry) => {
      if (entry.scope === "page") return exclusionMatches(entry, candidate, snapshot, occurrence);
      const matches = occurrences.filter((item) => exclusionMatches(entry, candidate, snapshot, item));
      return matches.length === 1 && matches[0]?.id === occurrence.id;
    }));
  }

  hasPageRule(pageId: number, ruleId: string): boolean {
    return [...this.values.values()].some((entry) => entry.scope === "page" && entry.pageId === pageId && entry.ruleId === ruleId);
  }

  list(): ExclusionEntry[] {
    return [...this.values.values()].sort((left, right) => left.title.localeCompare(right.title));
  }

  pending(): ExclusionEntry[] {
    return this.list().filter((entry) => entry.pending && entry.scope === "occurrence");
  }

  markPublished(keys: Set<string>): void {
    for (const key of keys) {
      const entry = this.values.get(key);
      if (entry) entry.pending = false;
    }
    this.write();
  }

  remove(key: string): void { this.values.delete(key); this.write(); }
  clear(): void { this.values.clear(); this.write(); }
}
