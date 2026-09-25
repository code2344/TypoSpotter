import { ABOUT_PAGE, VERSION } from "../config";
import { changedSegments, type LocalDiffRow } from "../diff/local";
import type { Candidate, ExclusionEntry, Proposal, SessionStats } from "../types";
import { STYLES } from "./styles";

export interface ViewActions {
  onOccurrenceChange(id: string, selected: boolean): void;
  onProposalInput(text: string): void;
  onRefreshDiff(): void;
  onResetProposal(): void;
  onSkip(): void;
  onExcludeOccurrence(id: string, reason: string): void;
  onRemoveExclusion(key: string): void;
  onClearExclusions(): void;
  onPublishExclusions(): void;
  onLoadMore(): void;
  onSave(summary: string): void;
  onQueueSelect(candidate: Candidate): void;
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

function link(label: string, href: string): HTMLAnchorElement {
  const node = element("a", "ts-link");
  node.textContent = label;
  node.href = href;
  node.target = "_blank";
  node.rel = "noopener";
  return node;
}

export class TypoSpotterView {
  private readonly root = element("div");
  private readonly status = element("div", "ts-status");
  private readonly queueList = element("ul", "ts-queue");
  private readonly loadMoreButton = element("button", "ts-button ts-button-quiet ts-load-more");
  private readonly empty = element("div", "ts-empty");
  private readonly review = element("section", "ts-review");
  private readonly title = element("h2", "ts-review-title");
  private readonly pageLinks = element("div", "ts-page-links");
  private readonly counter = element("div", "ts-counter");
  private readonly rulebar = element("div", "ts-rulebar");
  private readonly occurrenceList = element("div", "ts-occurrence-list");
  private readonly occurrenceHelp = element("p", "ts-occurrence-help");
  private readonly diff = element("div", "ts-diff");
  private readonly editor = element("textarea", "ts-editor");
  private readonly summary = element("input", "ts-input");
  private readonly refreshButton = element("button", "ts-button");
  private readonly editButton = element("button", "ts-button ts-button-quiet");
  private readonly resetButton = element("button", "ts-button ts-button-quiet");
  private readonly skipButton = element("button", "ts-button");
  private readonly exclusionsButton = element("button", "ts-button ts-button-quiet");
  private readonly publishExclusionsButton = element("button", "ts-button ts-button-primary");
  private readonly exclusionsPanel = element("section", "ts-exclusions-panel");
  private readonly exclusionsList = element("div", "ts-exclusions-list");
  private readonly saveButton = element("button", "ts-button ts-button-primary");
  private readonly diffPanel = element("section", "ts-panel ts-diff-panel");
  private readonly editorPanel = element("section", "ts-panel ts-editor-panel");
  private readonly statsNodes = new Map<keyof SessionStats, HTMLElement>();
  private currentOccurrenceIds: string[] = [];
  private pendingExclusionCount = 0;
  private actions?: ViewActions;

  constructor(container: HTMLElement) {
    this.root.id = "ts-root";
    const style = element("style");
    style.textContent = STYLES;
    document.head.appendChild(style);

    const topbar = element("header", "ts-topbar");
    const brand = element("div", "ts-brand");
    const brandName = element("span", "ts-brand-name");
    brandName.textContent = "TypoSpotter";
    const version = element("span", "ts-version");
    version.textContent = `v${VERSION}`;
    brand.append(brandName, version);
    const topbarActions = element("div", "ts-topbar-actions");
    this.exclusionsButton.type = "button";
    this.exclusionsButton.addEventListener("click", () => this.openExclusions());
    topbarActions.append(this.exclusionsButton, link("About and help", mw.util.getUrl(ABOUT_PAGE)));
    topbar.append(brand, topbarActions);

    const layout = element("div", "ts-layout");
    const sidebar = element("aside", "ts-sidebar");
    const queueHeading = element("h2", "ts-section-title");
    queueHeading.textContent = "Review queue";
    const statsHeading = element("h2", "ts-section-title");
    statsHeading.textContent = "This session";
    const stats = element("div", "ts-stats");
    const labels: Array<[keyof SessionStats, string]> = [
      ["reviewed", "Reviewed"],
      ["saved", "Saved"],
      ["skipped", "Skipped"]
    ];
    for (const [key, label] of labels) {
      const stat = element("div", "ts-stat");
      const value = element("span", "ts-stat-value");
      value.textContent = "0";
      const caption = element("span", "ts-stat-label");
      caption.textContent = label;
      stat.append(value, caption);
      stats.append(stat);
      this.statsNodes.set(key, value);
    }
    this.loadMoreButton.type = "button";
    this.loadMoreButton.textContent = "Load more";
    this.loadMoreButton.addEventListener("click", () => this.actions?.onLoadMore());
    sidebar.append(queueHeading, this.queueList, this.loadMoreButton, statsHeading, stats);

    const main = element("main", "ts-main");
    this.status.setAttribute("role", "status");
    this.status.setAttribute("aria-live", "polite");
    const emptyInner = element("div", "ts-empty-inner");
    const emptyTitle = element("h2");
    emptyTitle.textContent = "Finding likely typos";
    const emptyText = element("p");
    emptyText.textContent = "TypoSpotter is building a small review queue from current English Wikipedia articles.";
    emptyInner.append(emptyTitle, emptyText);
    this.empty.append(emptyInner);
    this.buildReview();
    main.append(this.status, this.empty, this.review);
    layout.append(sidebar, main);
    this.buildExclusionsPanel();
    this.root.append(topbar, layout, this.exclusionsPanel);

    container.replaceChildren(this.root);
    document.addEventListener("keydown", (event) => this.handleShortcut(event));
  }

  private buildExclusionsPanel(): void {
    this.exclusionsPanel.hidden = true;
    this.exclusionsPanel.setAttribute("aria-label", "Saved not-typo exclusions");
    const header = element("div", "ts-exclusions-header");
    const title = element("h2");
    title.textContent = "Not typos";
    const close = element("button", "ts-button");
    close.type = "button";
    close.textContent = "Close";
    close.addEventListener("click", () => { this.exclusionsPanel.hidden = true; });
    header.append(title, close);
    const description = element("p", "ts-exclusions-description");
    description.textContent = "These page and spelling pairs stay excluded in this browser.";
    const footer = element("div", "ts-exclusions-footer");
    const clear = element("button", "ts-button ts-button-danger");
    clear.type = "button";
    clear.textContent = "Clear all";
    clear.addEventListener("click", () => this.actions?.onClearExclusions());
    this.publishExclusionsButton.type = "button";
    this.publishExclusionsButton.textContent = "Publish pending";
    this.publishExclusionsButton.addEventListener("click", () => this.actions?.onPublishExclusions());
    footer.append(clear, this.publishExclusionsButton);
    this.exclusionsPanel.append(header, description, this.exclusionsList, footer);
  }

  private openExclusions(): void {
    this.exclusionsPanel.hidden = false;
    this.exclusionsPanel.querySelector<HTMLButtonElement>("button")?.focus();
  }

  setActions(actions: ViewActions): void {
    this.actions = actions;
  }

  private buildReview(): void {
    this.review.hidden = true;
    const header = element("div", "ts-review-header");
    const titleGroup = element("div");
    titleGroup.append(this.title, this.pageLinks);
    header.append(titleGroup, this.counter);

    const occurrences = element("section", "ts-occurrences");
    const occurrenceHeading = element("h3", "ts-section-title");
    occurrenceHeading.textContent = "Occurrences included in this edit";
    occurrences.append(occurrenceHeading, this.occurrenceList, this.occurrenceHelp);

    const diffHeading = element("div", "ts-panel-heading");
    const diffTitle = element("h3");
    diffTitle.textContent = "Proposed change";
    this.refreshButton.type = "button";
    this.refreshButton.textContent = "Refresh diff  R";
    this.refreshButton.addEventListener("click", () => this.actions?.onRefreshDiff());
    diffHeading.append(diffTitle, this.refreshButton);
    this.diffPanel.append(diffHeading, this.diff);

    const editorHeading = element("div", "ts-panel-heading");
    const editorTitle = element("h3");
    editorTitle.textContent = "Proposed wikitext";
    this.resetButton.type = "button";
    this.resetButton.textContent = "Reset to selected occurrences";
    this.resetButton.addEventListener("click", () => this.actions?.onResetProposal());
    editorHeading.append(editorTitle, this.resetButton);
    this.editor.spellcheck = false;
    this.editor.setAttribute("aria-label", "Proposed page wikitext");
    this.editor.addEventListener("input", () => this.actions?.onProposalInput(this.editor.value));
    this.editor.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        this.toggleEditor();
        this.editButton.focus();
      }
    });
    this.editorPanel.hidden = true;
    this.editorPanel.append(editorHeading, this.editor);

    const summaryRow = element("div", "ts-summary-row");
    const summaryLabel = element("label");
    summaryLabel.textContent = "Edit summary";
    summaryLabel.htmlFor = "ts-summary";
    this.summary.id = "ts-summary";
    this.summary.type = "text";
    this.summary.maxLength = 500;
    summaryRow.append(summaryLabel, this.summary);

    const actions = element("div", "ts-actions");
    this.skipButton.type = "button";
    this.skipButton.textContent = "Skip  S";
    this.skipButton.addEventListener("click", () => this.actions?.onSkip());
    this.editButton.type = "button";
    this.editButton.textContent = "Edit wikitext  E";
    this.editButton.addEventListener("click", () => this.toggleEditor());
    const spacer = element("span", "ts-actions-spacer");
    this.saveButton.type = "button";
    this.saveButton.textContent = "Save and next  A";
    this.saveButton.addEventListener("click", () => this.actions?.onSave(this.summary.value));
    actions.append(this.skipButton, this.editButton, spacer, this.saveButton);

    const workspace = element("div", "ts-workspace");
    workspace.append(this.diffPanel, this.editorPanel);
    this.review.append(header, this.rulebar, occurrences, workspace, summaryRow, actions);
  }

  private handleShortcut(event: KeyboardEvent): void {
    if (event.defaultPrevented || event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
    const target = event.target as HTMLElement | null;
    if (target?.matches("input, textarea, select, button, [contenteditable='true']")) return;

    const key = event.key.toLowerCase();
    const shortcuts: Record<string, () => void> = {
      a: () => this.actions?.onSave(this.summary.value),
      s: () => this.actions?.onSkip(),
      x: () => {
        if (this.currentOccurrenceIds.length === 1) this.excludeOccurrence(this.currentOccurrenceIds[0]!);
        else this.setStatus("Choose Not a typo beside the specific occurrence.");
      },
      r: () => this.actions?.onRefreshDiff(),
      e: () => this.toggleEditor()
    };
    const action = shortcuts[key];
    if (!action) return;
    event.preventDefault();
    action();
  }

  private toggleEditor(): void {
    const showEditor = this.editorPanel.hidden;
    this.editorPanel.hidden = !showEditor;
    this.diffPanel.hidden = showEditor;
    this.editButton.textContent = showEditor ? "Show diff  E" : "Edit wikitext  E";
    if (showEditor) this.editor.focus();
  }

  setStatus(message: string, kind: "normal" | "error" | "success" = "normal"): void {
    this.status.textContent = message;
    this.status.dataset.kind = kind;
  }

  showEmpty(title: string, message: string): void {
    this.review.hidden = true;
    this.empty.hidden = false;
    const heading = this.empty.querySelector("h2");
    const paragraph = this.empty.querySelector("p");
    if (heading) heading.textContent = title;
    if (paragraph) paragraph.textContent = message;
  }

  renderQueue(current: Candidate | undefined, queue: Candidate[]): void {
    this.queueList.replaceChildren();
    const items = current ? [current, ...queue.slice(0, 7)] : queue.slice(0, 8);
    if (items.length === 0) {
      const empty = element("li", "ts-queue-empty");
      empty.textContent = "No candidates loaded";
      this.queueList.append(empty);
      return;
    }
    items.forEach((candidate, index) => {
      const item = element("li", `ts-queue-item${index === 0 && current ? " is-current" : ""}`);
      const button = element("button", "ts-queue-button");
      button.type = "button";
      button.disabled = index === 0 && Boolean(current);
      const title = element("div", "ts-queue-title");
      title.textContent = candidate.title;
      title.title = candidate.title;
      const rule = element("div", "ts-queue-rule");
      rule.textContent = `${candidate.rule.find} → ${candidate.rule.replace}`;
      button.append(title, rule);
      if (!button.disabled) button.addEventListener("click", () => this.actions?.onQueueSelect(candidate));
      item.append(button);
      this.queueList.append(item);
    });
  }

  renderStats(stats: SessionStats): void {
    (Object.keys(stats) as Array<keyof SessionStats>).forEach((key) => {
      const node = this.statsNodes.get(key);
      if (node) node.textContent = String(stats[key]);
    });
  }

  renderExclusions(entries: ExclusionEntry[], sharedCount = 0): void {
    this.exclusionsButton.textContent = `Not typos (${entries.length})`;
    const pendingCount = entries.filter((entry) => entry.pending).length;
    this.pendingExclusionCount = pendingCount;
    this.publishExclusionsButton.disabled = pendingCount === 0;
    this.publishExclusionsButton.textContent = pendingCount > 0 ? `Publish pending (${pendingCount})` : "Publish pending";
    const description = this.exclusionsPanel.querySelector<HTMLElement>(".ts-exclusions-description");
    if (description) description.textContent = `${sharedCount} shared exclusions loaded. Local exclusions stay in this browser until published.`;
    this.exclusionsList.replaceChildren();
    if (entries.length === 0) {
      const empty = element("p", "ts-exclusions-empty");
      empty.textContent = "No saved exclusions.";
      this.exclusionsList.append(empty);
      return;
    }
    for (const entry of entries) {
      const row = element("div", "ts-exclusion-row");
      const details = element("div");
      const title = element("div", "ts-exclusion-title");
      title.textContent = entry.title;
      const rule = element("div", "ts-exclusion-rule");
      const location = entry.lineNumber ? ` · original line ${entry.lineNumber}` : "";
      const pending = entry.pending ? " · pending" : "";
      rule.textContent = `${entry.replacement ? `${entry.find} → ${entry.replacement}` : entry.find}${location}${pending}`;
      details.append(title, rule);
      const remove = element("button", "ts-button ts-button-quiet ts-button-danger");
      remove.type = "button";
      remove.textContent = "Remove";
      remove.addEventListener("click", () => this.actions?.onRemoveExclusion(entry.key));
      row.append(details, remove);
      this.exclusionsList.append(row);
    }
  }

  renderProposal(proposal: Proposal, queuePosition: number, total: number, summary: string): void {
    this.empty.hidden = true;
    this.review.hidden = false;
    this.title.textContent = proposal.snapshot.title;
    this.pageLinks.replaceChildren(
      link("Open article", mw.util.getUrl(proposal.snapshot.title)),
      link("History", mw.util.getUrl(proposal.snapshot.title, { action: "history" }))
    );
    this.counter.textContent = `${queuePosition} of ${total}`;
    this.rulebar.replaceChildren();
    const find = element("span", "ts-replacement");
    find.textContent = `"${proposal.candidate.rule.find}"`;
    const arrow = element("span", "ts-arrow");
    arrow.textContent = "→";
    const replacement = element("span", "ts-replacement");
    replacement.textContent = `"${proposal.candidate.rule.replace}"`;
    const note = element("span", "ts-rule-note");
    note.textContent = proposal.candidate.rule.note;
    this.rulebar.append(find, arrow, replacement, note);
    this.summary.value = summary;
    this.editorPanel.hidden = true;
    this.diffPanel.hidden = false;
    this.editButton.textContent = "Edit wikitext  E";
    this.renderOccurrences(proposal);
    this.setEditorText(proposal.text);
  }

  renderOccurrences(proposal: Proposal): void {
    this.occurrenceList.replaceChildren();
    this.currentOccurrenceIds = proposal.occurrences.map((occurrence) => occurrence.id);
    for (const occurrence of proposal.occurrences) {
      const label = element("label", "ts-occurrence");
      const checkbox = element("input");
      checkbox.type = "checkbox";
      checkbox.checked = proposal.selected.has(occurrence.id);
      checkbox.disabled = proposal.manuallyEdited;
      checkbox.addEventListener("change", () => this.actions?.onOccurrenceChange(occurrence.id, checkbox.checked));
      const context = element("span", "ts-context");
      const before = element("span", "ts-context-before");
      before.textContent = occurrence.before;
      const found = element("span", "ts-context-find");
      found.textContent = occurrence.matched;
      const separator = document.createTextNode(" ");
      const replaced = element("span", "ts-context-replace");
      replaced.textContent = occurrence.replacement;
      const after = element("span", "ts-context-after");
      after.textContent = occurrence.after;
      context.append(before, found, separator, replaced, after);
      const exclude = element("button", "ts-button ts-button-quiet ts-button-danger ts-occurrence-exclude");
      exclude.type = "button";
      exclude.textContent = "Not a typo";
      exclude.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.excludeOccurrence(occurrence.id);
      });
      label.append(checkbox, context, exclude);
      this.occurrenceList.append(label);
    }
    this.occurrenceHelp.textContent = proposal.manuallyEdited
      ? "Occurrence controls are paused because the proposed wikitext was edited manually. Reset to use them again."
      : "Uncheck any occurrence that should remain unchanged, then refresh the diff.";
  }

  private excludeOccurrence(id: string): void {
    const reason = window.prompt("Why should this occurrence remain unchanged?", "Direct quotation");
    if (reason === null) return;
    this.actions?.onExcludeOccurrence(id, reason.trim().slice(0, 200));
  }

  setEditorText(text: string): void {
    if (this.editor.value !== text) this.editor.value = text;
  }

  setDiffLoading(): void {
    this.diff.replaceChildren();
    const placeholder = element("div", "ts-diff-placeholder");
    placeholder.textContent = "Generating the Wikipedia diff…";
    this.diff.append(placeholder);
    this.setSaveEnabled(false);
  }

  setDiff(rows: LocalDiffRow[]): void {
    this.diff.replaceChildren();
    for (const row of rows) {
      const block = element("article", "ts-diff-block");
      const heading = element("div", "ts-diff-line");
      heading.textContent = `Line ${row.lineNumber}`;
      const contextBefore = this.renderContext(row.beforeContext);
      const comparison = element("div", "ts-diff-comparison");
      comparison.append(
        this.renderDiffSide("Before", row.original, row.proposed, false),
        this.renderDiffSide("After", row.proposed, row.original, true)
      );
      const contextAfter = this.renderContext(row.afterContext);
      block.append(heading);
      if (contextBefore) block.append(contextBefore);
      block.append(comparison);
      if (contextAfter) block.append(contextAfter);
      this.diff.append(block);
    }
  }

  private renderContext(lines: string[]): HTMLElement | null {
    if (lines.length === 0) return null;
    const context = element("pre", "ts-diff-context");
    context.textContent = lines.join("\n");
    return context;
  }

  private renderDiffSide(label: string, value: string, counterpart: string, added: boolean): HTMLElement {
    const side = element("section", `ts-diff-side ${added ? "is-added" : "is-removed"}`);
    const sideLabel = element("div", "ts-diff-side-label");
    sideLabel.textContent = label;
    const content = element("pre", "ts-diff-text");
    const segments = added
      ? changedSegments(counterpart, value)
      : changedSegments(value, counterpart);
    content.append(document.createTextNode(segments.prefix));
    const changed = element("mark", "ts-diff-highlight");
    changed.textContent = added ? segments.proposed : segments.original;
    content.append(changed, document.createTextNode(segments.suffix));
    side.append(sideLabel, content);
    return side;
  }

  setDiffError(message: string): void {
    this.diff.replaceChildren();
    const placeholder = element("div", "ts-diff-placeholder");
    placeholder.textContent = message;
    this.diff.append(placeholder);
    this.setSaveEnabled(false);
  }

  setDirty(): void {
    this.setDiffError("The proposal changed. Refresh the diff before saving.");
  }

  setBusy(busy: boolean): void {
    this.refreshButton.disabled = busy;
    this.resetButton.disabled = busy;
    this.skipButton.disabled = busy;
    this.editButton.disabled = busy;
    this.editor.disabled = busy;
    this.summary.disabled = busy;
    this.publishExclusionsButton.disabled = busy || this.pendingExclusionCount === 0;
    this.loadMoreButton.disabled = busy;
    this.occurrenceList.querySelectorAll<HTMLButtonElement>(".ts-occurrence-exclude").forEach((button) => {
      button.disabled = busy;
    });
    if (busy) this.saveButton.disabled = true;
  }

  setSaveEnabled(enabled: boolean): void {
    this.saveButton.disabled = !enabled;
  }
}
