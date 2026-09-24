import { EXCLUSIONS_KEY } from "../config";

export class ExclusionStore {
  private values: Set<string>;

  constructor() {
    this.values = new Set(this.read());
  }

  private read(): string[] {
    try {
      const raw = mw.storage?.get(EXCLUSIONS_KEY) ?? localStorage.getItem(EXCLUSIONS_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
    } catch {
      return [];
    }
  }

  private write(): void {
    const raw = JSON.stringify([...this.values]);
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

  add(pageId: number, ruleId: string): void {
    this.values.add(this.key(pageId, ruleId));
    this.write();
  }
}
