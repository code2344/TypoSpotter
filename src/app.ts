import { MediaWikiApi, TypoSpotterApiError } from "./api/mediawiki";
import { ABOUT_PAGE, COMMUNITY_EXCLUSIONS_PAGE, editSummary, isIgnoredTitle, QUEUE_TARGET, titleContainsRule, VERSION } from "./config";
import { buildLocalDiff } from "./diff/local";
import { RULES } from "./rules/catalog";
import type { TypoRule } from "./types";
import { ExclusionStore } from "./state/exclusions";
import { parseCommunityExclusions, serializeCommunityExclusions } from "./state/community";
import type { Candidate, ExclusionEntry, PreparedCandidate, Proposal, SessionStats } from "./types";
import { TypoSpotterView } from "./ui/view";
import { applyOccurrences } from "./wikitext/proposal";
import { findOccurrences } from "./wikitext/scanner";

const SEARCH_RULES_PER_BATCH = 5;
const VALIDATION_WORKERS = 4;
const MAX_SEARCH_BATCHES_PER_REFILL = 4;

function errorMessage(error: unknown): string {
  if (!(error instanceof TypoSpotterApiError)) {
    return error instanceof Error ? error.message : "Something went wrong.";
  }
  const known: Record<string, string> = {
    assertuserfailed: "Your Wikipedia session is no longer logged in. Reload after signing in.",
    editconflict: "The article changed after this diff was prepared. TypoSpotter has reloaded it for review.",
    protectedpage: "This page is protected and cannot be edited by this account.",
    permissiondenied: "This account does not have permission to edit the page.",
    ratelimited: "Wikipedia is limiting edits temporarily. The proposal has been kept so you can retry.",
    maxlag: "Wikipedia's servers are busy. The proposal has been kept so you can retry.",
    "abusefilter-disallowed": "An edit filter disallowed this change. Nothing was saved.",
    spamblacklist: "The edit was rejected by the spam blacklist. Nothing was saved.",
    captcha: "Wikipedia requires a CAPTCHA for this edit. Open the normal edit page to continue."
  };
  return known[error.code] || error.message;
}

export class TypoSpotterApp {
  private readonly api = new MediaWikiApi();
  private readonly exclusions = new ExclusionStore();
  private readonly view: TypoSpotterView;
  private readonly queue: PreparedCandidate[] = [];
  private readonly seen = new Set<string>();
  private readonly continuations = new Map<string, number>();
  private stats: SessionStats = { reviewed: 0, saved: 0, skipped: 0 };
  private proposal?: Proposal;
  private current?: PreparedCandidate;
  private nextRuleIndex = 0;
  private busy = false;
  private diffText?: string;
  private loadedCount = 0;
  private refillPromise?: Promise<void>;
  private communityExclusions: ExclusionEntry[] = [];
  private rules: TypoRule[] = RULES;

  constructor(container: HTMLElement) {
    this.view = new TypoSpotterView(container);
    this.view.setActions({
      onOccurrenceChange: (id, selected) => this.changeOccurrence(id, selected),
      onProposalInput: (text) => this.changeProposal(text),
      onRefreshDiff: () => void this.refreshDiff(),
      onResetProposal: () => this.resetProposal(),
      onSkip: () => void this.skip(),
      onExcludeOccurrence: (id, reason) => void this.excludeOccurrence(id, reason),
      onRemoveExclusion: (key) => this.removeExclusion(key),
      onClearExclusions: () => this.clearExclusions(),
      onPublishExclusions: () => void this.publishExclusions(),
      onLoadMore: () => void this.loadMore(),
      onSave: (summary) => void this.save(summary),
      onQueueSelect: (candidate) => void this.selectCandidate(candidate)
    });
    this.view.renderExclusions(this.exclusions.list());
  }

  async start(): Promise<void> {
    if (!mw.config.get("wgUserName")) {
      this.view.showEmpty("Sign in required", "TypoSpotter makes edits through your Wikipedia account. Sign in, then reload this page.");
      this.view.setStatus("Not signed in", "error");
      return;
    }

    this.view.renderStats(this.stats);
    this.view.renderQueue(undefined, []);
    this.view.setStatus("Searching English Wikipedia for a small set of likely typos…");
    try {
      await this.loadCommunityExclusions();
      await this.loadRules();
      await this.refillQueue(1);
      await this.advance();
    } catch (error) {
      this.view.showEmpty("Could not start TypoSpotter", errorMessage(error));
      this.view.setStatus(errorMessage(error), "error");
    }
  }

  private async loadRules(): Promise<void> {
    try {
      const imported = await this.api.loadAwbTypos();
      if (imported.length > 0) {
        const merged = new Map<string, TypoRule>();
        for (const rule of [...RULES, ...imported]) merged.set(rule.id, rule);
        this.rules = [...merged.values()];
      }
    } catch {
      this.rules = RULES;
    }
  }

  private candidateKey(candidate: Candidate): string {
    return `${candidate.pageId}:${candidate.rule.id}`;
  }

  private async loadCommunityExclusions(): Promise<void> {
    try {
      const snapshot = await this.api.loadPageByTitle(COMMUNITY_EXCLUSIONS_PAGE);
      this.communityExclusions = parseCommunityExclusions(snapshot.text);
    } catch {
      this.communityExclusions = [];
    }
    this.view.renderExclusions(this.exclusions.list(), this.communityExclusions.length);
  }

  private async refillQueue(target = QUEUE_TARGET): Promise<void> {
    if (this.queue.length >= target) return;
    if (this.refillPromise) {
      await this.refillPromise;
      if (this.queue.length < target) return this.refillQueue(target);
      return;
    }

    this.refillPromise = this.buildValidatedQueue(target);
    try {
      await this.refillPromise;
    } finally {
      this.refillPromise = undefined;
    }
  }

  private async buildValidatedQueue(target: number): Promise<void> {
    let batchesTried = 0;

    while (this.queue.length < target && batchesTried < MAX_SEARCH_BATCHES_PER_REFILL) {
      batchesTried += 1;

      const rules = Array.from({ length: SEARCH_RULES_PER_BATCH }, (_, offset) => {
        const index = (this.nextRuleIndex + offset) % this.rules.length;
        return this.rules[index];
      }).filter((rule): rule is TypoRule => Boolean(rule));
      this.nextRuleIndex = (this.nextRuleIndex + SEARCH_RULES_PER_BATCH) % this.rules.length;

      const batches = await Promise.allSettled(
        rules.map((rule) => this.api.search(rule, this.continuations.get(rule.id)))
      );
      let successfulSearches = 0;
      const candidates: Candidate[] = [];
      batches.forEach((result, index) => {
        const rule = rules[index];
        if (result.status !== "fulfilled" || !rule) return;
        successfulSearches += 1;
        if (result.value.continueToken !== undefined) {
          this.continuations.set(rule.id, result.value.continueToken);
        } else {
          this.continuations.delete(rule.id);
        }
        for (const candidate of result.value.candidates) {
          const key = this.candidateKey(candidate);
          if (
            isIgnoredTitle(candidate.title) ||
            titleContainsRule(candidate.title, candidate.rule) ||
            this.seen.has(key) ||
            this.exclusions.hasPageRule(candidate.pageId, candidate.rule.id) ||
            this.communityExclusions.some((entry) => entry.scope === "page" && entry.pageId === candidate.pageId && entry.ruleId === candidate.rule.id)
          ) continue;
          this.seen.add(key);
          candidates.push(candidate);
        }
      });

      if (successfulSearches === 0) {
        throw new TypoSpotterApiError("Candidate searches failed. Try reloading in a moment.", "searchfailed");
      }

      let nextIndex = 0;
      const worker = async (): Promise<void> => {
        while (this.queue.length < target && nextIndex < candidates.length) {
          const candidate = candidates[nextIndex++];
          if (!candidate) return;
          try {
            const snapshot = await this.api.loadPage(candidate);
            const occurrences = this.exclusions.filter(
              candidate,
              snapshot,
              findOccurrences(snapshot.text, candidate.rule),
              this.communityExclusions
            );
            if (occurrences.length === 0) continue;
            this.queue.push({ candidate, snapshot, occurrences });
            this.view.renderQueue(this.current?.candidate, this.queue.map((item) => item.candidate));
          } catch {
            // A candidate that cannot be fetched safely is omitted from the review queue.
          }
        }
      };
      await Promise.all(Array.from({ length: VALIDATION_WORKERS }, () => worker()));
    }
  }

  private refillInBackground(): void {
    void this.refillQueue().catch(() => {
      // The current proposal remains usable; the next foreground refill can retry.
    });
  }

  private async loadMore(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.view.setBusy(true);
    this.view.setStatus("Searching for more reviewable typos…");
    try {
      await this.refillQueue(Math.max(8, this.queue.length + 8));
      this.view.renderQueue(this.current?.candidate, this.queue.map((item) => item.candidate));
      this.view.setStatus(this.queue.length > 0 ? "More reviewable candidates loaded." : "No more reviewable candidates found.");
    } catch (error) {
      this.view.setStatus(errorMessage(error), "error");
    } finally {
      this.busy = false;
      this.view.setBusy(false);
      if (this.proposal && this.diffText === this.proposal.text) this.view.setSaveEnabled(true);
    }
  }

  private async advance(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.view.setBusy(true);
    this.proposal = undefined;
    this.diffText = undefined;

    try {
      if (this.queue.length === 0) await this.refillQueue(1);

      const prepared = this.queue.shift();
      if (prepared) {
        const { candidate, snapshot, occurrences } = prepared;
        this.current = prepared;
        this.view.renderQueue(candidate, this.queue.map((item) => item.candidate));
        this.view.setStatus(`Loading ${candidate.title}…`);

        const selected = new Set(occurrences.map((occurrence) => occurrence.id));
        this.proposal = {
          candidate,
          snapshot,
          occurrences,
          selected,
          text: applyOccurrences(snapshot.text, occurrences, selected),
          manuallyEdited: false
        };
        this.loadedCount += 1;
        this.view.renderProposal(
          this.proposal,
          this.loadedCount,
          this.loadedCount + this.queue.length,
          editSummary(candidate.rule.find, candidate.rule.replace)
        );
        this.view.renderQueue(candidate, this.queue.map((item) => item.candidate));
        this.view.setBusy(false);
        this.busy = false;
        await this.refreshDiff();
        this.refillInBackground();
        return;
      }

      this.current = undefined;
      this.view.renderQueue(undefined, []);
      this.view.showEmpty("No candidates found", "The current rule batch did not return any reviewable occurrences. Reload to search again.");
      this.view.setStatus("Queue finished");
    } finally {
      this.busy = false;
      this.view.setBusy(false);
    }
  }

  private changeOccurrence(id: string, selected: boolean): void {
    if (!this.proposal || this.busy || this.proposal.manuallyEdited) return;
    if (selected) this.proposal.selected.add(id);
    else this.proposal.selected.delete(id);
    this.proposal.text = applyOccurrences(
      this.proposal.snapshot.text,
      this.proposal.occurrences,
      this.proposal.selected
    );
    this.diffText = undefined;
    this.view.setEditorText(this.proposal.text);
    this.view.setDirty();
  }

  private changeProposal(text: string): void {
    if (!this.proposal || this.busy || text === this.proposal.text) return;
    this.proposal.text = text;
    this.proposal.manuallyEdited = true;
    this.diffText = undefined;
    this.view.renderOccurrences(this.proposal);
    this.view.setDirty();
  }

  private resetProposal(): void {
    if (!this.proposal || this.busy) return;
    this.proposal.manuallyEdited = false;
    this.proposal.text = applyOccurrences(
      this.proposal.snapshot.text,
      this.proposal.occurrences,
      this.proposal.selected
    );
    this.diffText = undefined;
    this.view.setEditorText(this.proposal.text);
    this.view.renderOccurrences(this.proposal);
    this.view.setDirty();
  }

  private async refreshDiff(): Promise<void> {
    if (!this.proposal || this.busy) return;
    if (this.proposal.text === this.proposal.snapshot.text) {
      this.diffText = undefined;
      this.view.setDiffError("Select at least one change before generating the diff.");
      return;
    }
    this.busy = true;
    this.view.setBusy(true);
    this.view.setDiffLoading();
    const textAtRequest = this.proposal.text;
    const rows = buildLocalDiff(this.proposal.snapshot.text, textAtRequest);
    this.diffText = textAtRequest;
    this.view.setDiff(rows);
    this.view.setStatus("Review the comparison, adjust the proposal if needed, then save or skip.");
    this.busy = false;
    this.view.setBusy(false);
    this.view.setSaveEnabled(true);
  }

  private async selectCandidate(candidate: Candidate): Promise<void> {
    if (this.busy || this.current?.candidate === candidate) return;
    const index = this.queue.findIndex((item) => this.candidateKey(item.candidate) === this.candidateKey(candidate));
    if (index < 0) return;
    const [selected] = this.queue.splice(index, 1);
    if (!selected) return;
    if (this.current) this.queue.push(this.current);
    this.queue.unshift(selected);
    this.current = undefined;
    await this.advance();
  }

  private async skip(): Promise<void> {
    if (this.busy || !this.proposal) return;
    this.stats.reviewed += 1;
    this.stats.skipped += 1;
    this.view.renderStats(this.stats);
    await this.advance();
  }

  private async excludeOccurrence(id: string, reason: string): Promise<void> {
    if (this.busy || !this.proposal) return;
    const occurrence = this.proposal.occurrences.find((item) => item.id === id);
    if (!occurrence) return;
    this.exclusions.addOccurrence(this.proposal.candidate, this.proposal.snapshot, occurrence, reason);
    this.view.renderExclusions(this.exclusions.list(), this.communityExclusions.length);
    this.proposal.occurrences = this.proposal.occurrences.filter((item) => item.id !== id);
    this.proposal.selected.delete(id);
    if (this.proposal.occurrences.length === 0) {
      this.stats.reviewed += 1;
      this.stats.skipped += 1;
      this.view.renderStats(this.stats);
      await this.advance();
      return;
    }
    this.proposal.text = applyOccurrences(this.proposal.snapshot.text, this.proposal.occurrences, this.proposal.selected);
    this.view.renderOccurrences(this.proposal);
    this.view.setEditorText(this.proposal.text);
    this.diffText = undefined;
    await this.refreshDiff();
  }

  private removeExclusion(key: string): void {
    this.exclusions.remove(key);
    this.view.renderExclusions(this.exclusions.list(), this.communityExclusions.length);
  }

  private clearExclusions(): void {
    this.exclusions.clear();
    this.view.renderExclusions([], this.communityExclusions.length);
  }

  private async publishExclusions(): Promise<void> {
    if (this.busy) return;
    const pending = this.exclusions.pending();
    if (pending.length === 0) return;
    this.busy = true;
    this.view.setBusy(true);
    this.view.setStatus(`Publishing ${pending.length} shared exclusion${pending.length === 1 ? "" : "s"}…`);
    try {
      const snapshot = await this.api.loadPageByTitle(COMMUNITY_EXCLUSIONS_PAGE);
      const existing = parseCommunityExclusions(snapshot.text);
      const merged = [...new Map([...existing, ...pending].map((entry) => [entry.key, entry])).values()];
      await this.api.edit(
        snapshot,
        serializeCommunityExclusions(merged),
        `Add ${pending.length} TypoSpotter exclusion${pending.length === 1 ? "" : "s"} ([[${ABOUT_PAGE}|TS v${VERSION}]])`
      );
      this.exclusions.markPublished(new Set(pending.map((entry) => entry.key)));
      this.communityExclusions = merged.map((entry) => ({ ...entry, pending: false }));
      this.view.renderExclusions(this.exclusions.list(), this.communityExclusions.length);
      this.view.setStatus("Shared exclusions published.", "success");
    } catch (error) {
      this.view.setStatus(errorMessage(error), "error");
    } finally {
      this.busy = false;
      this.view.setBusy(false);
    }
  }

  private async save(summary: string): Promise<void> {
    if (!this.proposal || this.busy) return;
    if (!summary.trim()) {
      this.view.setStatus("Add an edit summary before saving.", "error");
      return;
    }
    if (this.diffText !== this.proposal.text) {
      this.view.setStatus("Refresh the diff before saving this version of the proposal.", "error");
      this.view.setSaveEnabled(false);
      return;
    }

    this.busy = true;
    this.view.setBusy(true);
    this.view.setStatus(`Saving ${this.proposal.snapshot.title}…`);
    try {
      const revisionId = await this.api.edit(this.proposal.snapshot, this.proposal.text, summary.trim());
      this.stats.reviewed += 1;
      this.stats.saved += 1;
      this.view.renderStats(this.stats);
      this.view.setStatus(`Saved revision ${revisionId}. Loading the next candidate…`, "success");
      this.busy = false;
      this.view.setBusy(false);
      await this.advance();
    } catch (error) {
      const code = error instanceof TypoSpotterApiError ? error.code : "unknown";
      this.view.setStatus(errorMessage(error), "error");
      this.busy = false;
      this.view.setBusy(false);
      if (code === "editconflict" && this.current) {
        const candidate = this.current.candidate;
        try {
          const snapshot = await this.api.loadPage(candidate);
          const occurrences = this.exclusions.filter(candidate, snapshot, findOccurrences(snapshot.text, candidate.rule), this.communityExclusions);
          if (occurrences.length > 0) this.queue.unshift({ candidate, snapshot, occurrences });
        } catch {
          // If the new revision is no longer reviewable, continue with the queue.
        }
        await this.advance();
      } else {
        this.view.setSaveEnabled(this.diffText === this.proposal?.text);
      }
    }
  }
}
