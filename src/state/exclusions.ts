import { EXCLUSIONS_KEY } from "../config";
import type { Candidate, ExclusionEntry } from "../types";

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
          return [{
            key: item,
            pageId,
            title: `Page ${pageId}`,
            ruleId,
            find: ruleId,
            replacement: "",
            createdAt: ""
          }];
        }
        if (!item || typeof item !== "object") return [];
        const entry = item as Partial<ExclusionEntry>;
        return typeof entry.key === "string" && typeof entry.pageId === "number" &&
          typeof entry.ruleId === "string" && typeof entry.title === "string"
          ? [{
              key: entry.key,
              pageId: entry.pageId,
              title: entry.title,
              ruleId: entry.ruleId,
              find: typeof entry.find === "string" ? entry.find : entry.ruleId,
              replacement: typeof entry.replacement === "string" ? entry.replacement : "",
              createdAt: typeof entry.createdAt === "string" ? entry.createdAt : ""
            }]
          : [];
      });
    } catch {
      return [];
    }
  }

  private write(): void {
    const raw = JSON.stringify(this.list());
    if (mw.storage) {
      mw.storage.set(EXCLUSIONS_KEY, raw);
    } else {
      localStorage.setItem(EXCLUSIONS_KEY, raw);
    }
  }

  key(pageId: number, ruleId: string): string {
    return `${pageId}:${ruleId}`;
  }

  has(pageId: number, ruleId: string): boolean {
    return this.values.has(this.key(pageId, ruleId));
  }

  add(candidate: Candidate): void {
    const key = this.key(candidate.pageId, candidate.rule.id);
    this.values.set(key, {
      key,
      pageId: candidate.pageId,
      title: candidate.title,
      ruleId: candidate.rule.id,
      find: candidate.rule.find,
      replacement: candidate.rule.replace,
      createdAt: new Date().toISOString()
    });
    this.write();
  }

  list(): ExclusionEntry[] {
    return [...this.values.values()].sort((left, right) => left.title.localeCompare(right.title));
  }

  remove(key: string): void {
    this.values.delete(key);
    this.write();
  }

  clear(): void {
    this.values.clear();
    this.write();
  }
}
