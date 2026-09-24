// <nowiki>
// TypoSpotter v0.3.1
// Source: https://github.com/code2344/TypoSpotter
"use strict";
(() => {
  // src/api/mediawiki.ts
  var TypoSpotterApiError = class extends Error {
    constructor(message, code = "unknown", details) {
      super(message);
      this.code = code;
      this.details = details;
      this.name = "TypoSpotterApiError";
    }
  };
  function normalizeError(error) {
    if (error instanceof TypoSpotterApiError) {
      return error;
    }
    if (typeof error === "string") {
      return new TypoSpotterApiError(`Wikipedia returned ${error}.`, error);
    }
    if (Array.isArray(error)) {
      const code = typeof error[0] === "string" ? error[0] : "unknown";
      const details = error[1];
      const message = details && typeof details === "object" && "info" in details ? String(details.info) : `Wikipedia returned ${code}.`;
      return new TypoSpotterApiError(message, code, details);
    }
    if (error && typeof error === "object") {
      const value = error;
      return new TypoSpotterApiError(
        value.info || value.message || "The Wikipedia request failed.",
        value.code || "unknown",
        error
      );
    }
    return new TypoSpotterApiError(String(error || "The Wikipedia request failed."));
  }
  function quoteForCirrus(value) {
    return value.replace(/["\\]/g, "\\$&");
  }
  var MediaWikiApi = class {
    constructor() {
      this.api = new mw.Api();
    }
    async search(rule, continueToken, limit = 8) {
      try {
        const response = await this.api.get({
          action: "query",
          list: "search",
          // CirrusSearch's regex engine does not support JavaScript-style word
          // boundaries. Discovery is literal; the local scanner enforces exact
          // whole-word matching against the freshly fetched revision.
          srsearch: `${rule.find} insource:"${quoteForCirrus(rule.find)}"`,
          srnamespace: 0,
          srlimit: limit,
          sroffset: continueToken,
          srprop: "",
          format: "json",
          formatversion: 2,
          maxlag: 5
        });
        const candidates = (response.query?.search ?? []).map(
          (item) => ({
            pageId: item.pageid,
            title: item.title,
            rule
          })
        );
        return {
          candidates,
          continueToken: response.continue?.sroffset
        };
      } catch (error) {
        throw normalizeError(error);
      }
    }
    async loadPage(candidate) {
      try {
        const response = await this.api.get({
          action: "query",
          pageids: candidate.pageId,
          prop: "info|revisions",
          intestactions: "edit",
          intestactionsdetail: "boolean",
          rvprop: "ids|timestamp|content|contentmodel",
          rvslots: "main",
          curtimestamp: 1,
          format: "json",
          formatversion: 2,
          maxlag: 5
        });
        const page = response.query?.pages?.[0];
        const revision = page?.revisions?.[0];
        const slot = revision?.slots?.main;
        if (!page || page.missing || !revision || typeof slot?.content !== "string") {
          throw new TypoSpotterApiError("The current page text is unavailable.", "missingcontent");
        }
        if (page.actions?.edit !== true) {
          throw new TypoSpotterApiError("This account cannot edit the page.", "permissiondenied");
        }
        return {
          pageId: page.pageid,
          title: page.title,
          revisionId: revision.revid,
          baseTimestamp: revision.timestamp,
          startTimestamp: response.curtimestamp,
          contentModel: slot.contentmodel || "wikitext",
          text: slot.content
        };
      } catch (error) {
        throw normalizeError(error);
      }
    }
    async edit(snapshot, text, summary) {
      try {
        const response = await this.api.postWithEditToken({
          action: "edit",
          pageid: snapshot.pageId,
          text,
          summary,
          baserevid: snapshot.revisionId,
          basetimestamp: snapshot.baseTimestamp,
          starttimestamp: snapshot.startTimestamp,
          assert: "user",
          minor: 1,
          watchlist: "preferences",
          maxlag: 5,
          format: "json",
          formatversion: 2
        });
        if (response.edit?.result !== "Success" || !response.edit?.newrevid) {
          throw new TypoSpotterApiError("Wikipedia did not confirm that the edit was saved.", "editfailed", response);
        }
        return response.edit.newrevid;
      } catch (error) {
        throw normalizeError(error);
      }
    }
  };

  // src/config.ts
  var VERSION = "0.3.1";
  var RUN_PAGE = "User:SuperCode111/TypoSpotter/run";
  var ABOUT_PAGE = "User:SuperCode111/TypoSpotter";
  var EXCLUSIONS_KEY = "TypoSpotter-exclusions-v1";
  var QUEUE_TARGET = 24;
  var IGNORED_TITLES = /* @__PURE__ */ new Set([
    "commonly misspelled english words"
  ]);
  function isIgnoredTitle(title) {
    return IGNORED_TITLES.has(title.trim().replaceAll("_", " ").toLowerCase());
  }
  function editSummary(find, replacement) {
    return `Fix typo: "${find}" -> "${replacement}" ([[${ABOUT_PAGE}|TS v${VERSION}]])`;
  }

  // src/diff/local.ts
  function commonPrefixLength(left, right) {
    const limit = Math.min(left.length, right.length);
    let index = 0;
    while (index < limit && left[index] === right[index]) index += 1;
    return index;
  }
  function commonSuffixLength(left, right, prefixLength) {
    const limit = Math.min(left.length, right.length) - prefixLength;
    let length = 0;
    while (length < limit && left[left.length - 1 - length] === right[right.length - 1 - length]) {
      length += 1;
    }
    return length;
  }
  function changedSegments(original, proposed) {
    const prefixLength = commonPrefixLength(original, proposed);
    const suffixLength = commonSuffixLength(original, proposed, prefixLength);
    return {
      prefix: original.slice(0, prefixLength),
      original: original.slice(prefixLength, suffixLength ? -suffixLength : void 0),
      proposed: proposed.slice(prefixLength, suffixLength ? -suffixLength : void 0),
      suffix: suffixLength ? original.slice(-suffixLength) : ""
    };
  }
  function buildLocalDiff(original, proposed) {
    const originalLines = original.split("\n");
    const proposedLines = proposed.split("\n");
    if (originalLines.length !== proposedLines.length) {
      return [{
        lineNumber: 1,
        beforeContext: [],
        original,
        proposed,
        afterContext: []
      }];
    }
    const rows = [];
    for (let index = 0; index < originalLines.length; index += 1) {
      const before = originalLines[index] ?? "";
      const after = proposedLines[index] ?? "";
      if (before === after) continue;
      rows.push({
        lineNumber: index + 1,
        beforeContext: originalLines.slice(Math.max(0, index - 2), index),
        original: before,
        proposed: after,
        afterContext: originalLines.slice(index + 1, Math.min(originalLines.length, index + 3))
      });
    }
    return rows;
  }

  // src/rules/catalog.ts
  var RULES = [
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

  // src/state/exclusions.ts
  var ExclusionStore = class {
    constructor() {
      this.values = new Set(this.read());
    }
    read() {
      try {
        const raw = mw.storage?.get(EXCLUSIONS_KEY) ?? localStorage.getItem(EXCLUSIONS_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
      } catch {
        return [];
      }
    }
    write() {
      const raw = JSON.stringify([...this.values]);
      if (mw.storage) {
        mw.storage.set(EXCLUSIONS_KEY, raw);
      } else {
        localStorage.setItem(EXCLUSIONS_KEY, raw);
      }
    }
    key(pageId, ruleId) {
      return `${pageId}:${ruleId}`;
    }
    has(pageId, ruleId) {
      return this.values.has(this.key(pageId, ruleId));
    }
    add(pageId, ruleId) {
      this.values.add(this.key(pageId, ruleId));
      this.write();
    }
  };

  // src/ui/styles.ts
  var STYLES = `
body.ts-active {
  overflow: hidden !important;
}

body.ts-active > :not(#ts-host) {
  display: none !important;
}

#ts-host {
  position: fixed;
  inset: 0;
  z-index: 2147483647;
  width: 100vw;
  height: 100dvh;
  margin: 0;
  padding: 0;
  overflow: hidden;
  background: var(--background-color-base, #fff);
}

#ts-root {
  --ts-bg: var(--background-color-base, #fff);
  --ts-surface: var(--background-color-neutral-subtle, #f8f9fa);
  --ts-surface-strong: var(--background-color-interactive-subtle, #eaecf0);
  --ts-border: var(--border-color-base, #a2a9b1);
  --ts-border-subtle: var(--border-color-subtle, #c8ccd1);
  --ts-text: var(--color-base, #202122);
  --ts-muted: var(--color-subtle, #54595d);
  --ts-link: var(--color-progressive, #36c);
  --ts-link-hover: var(--color-progressive--hover, #3056a9);
  --ts-success: var(--color-success, #14866d);
  --ts-danger: var(--color-destructive, #b32424);
  color: var(--ts-text);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  position: absolute;
  inset: 0;
  z-index: 1000;
  width: 100vw;
  max-width: none;
  height: 100dvh;
  margin: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  background: var(--ts-bg);
}

#ts-root *, #ts-root *::before, #ts-root *::after { box-sizing: border-box; }

.ts-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  flex: 0 0 52px;
  padding: .65rem 1rem;
  border-bottom: 1px solid var(--ts-border-subtle);
}

.ts-brand { display: flex; align-items: baseline; gap: .65rem; }
.ts-brand-name { font-family: Georgia, "Times New Roman", serif; font-size: 1.65rem; font-weight: 700; }
.ts-version { color: var(--ts-muted); font-size: .8rem; font-weight: 600; letter-spacing: .04em; }
.ts-topbar a, .ts-link { color: var(--ts-link); text-decoration: none; }
.ts-topbar a:hover, .ts-link:hover { color: var(--ts-link-hover); text-decoration: underline; }

.ts-layout {
  display: grid;
  grid-template-columns: minmax(210px, 260px) minmax(0, 1fr);
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
}

.ts-sidebar {
  border-right: 1px solid var(--ts-border-subtle);
  padding: .9rem .8rem;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.ts-main { min-width: 0; min-height: 0; padding: .8rem 1rem; overflow: hidden; display: flex; flex-direction: column; }
.ts-section-title { margin: 0 0 .65rem; font-size: .76rem; text-transform: uppercase; letter-spacing: .07em; color: var(--ts-muted); }
.ts-queue { list-style: none; padding: 0; margin: 0 0 1rem; overflow: hidden; flex: 1 1 auto; }
.ts-queue-item { padding: .62rem .65rem; border-left: 3px solid transparent; overflow: hidden; }
.ts-queue-item + .ts-queue-item { border-top: 1px solid var(--ts-border-subtle); }
.ts-queue-item.is-current { background: var(--ts-surface); border-left-color: var(--ts-link); }
.ts-queue-button { appearance: none; display: block; width: 100%; margin: 0; padding: 0; border: 0; background: transparent; color: inherit; text-align: left; font: inherit; cursor: pointer; }
.ts-queue-button:hover:not(:disabled) .ts-queue-title { color: var(--ts-link); text-decoration: underline; }
.ts-queue-button:focus-visible { outline: 2px solid var(--ts-link); outline-offset: 3px; }
.ts-queue-button:disabled { cursor: default; }
.ts-queue-title { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ts-queue-rule { color: var(--ts-muted); font-size: .78rem; margin-top: .12rem; }
.ts-queue-empty { color: var(--ts-muted); font-size: .9rem; padding: .5rem 0; }

.ts-stats { display: grid; grid-template-columns: 1fr 1fr; gap: .65rem; }
.ts-stat { border-top: 2px solid var(--ts-border); padding-top: .4rem; }
.ts-stat-value { display: block; font-size: 1.25rem; font-weight: 700; }
.ts-stat-label { color: var(--ts-muted); font-size: .76rem; }

.ts-status {
  flex: 0 0 auto;
  min-height: 1.25rem;
  margin-bottom: .35rem;
  color: var(--ts-muted);
  font-size: .9rem;
}
.ts-status[data-kind="error"] { color: var(--ts-danger); font-weight: 600; }
.ts-status[data-kind="success"] { color: var(--ts-success); font-weight: 600; }

.ts-empty {
  display: grid;
  place-items: center;
  flex: 1 1 auto;
  text-align: center;
  color: var(--ts-muted);
}
.ts-empty-inner { max-width: 520px; }
.ts-empty h2 { color: var(--ts-text); font-family: Georgia, "Times New Roman", serif; font-size: 1.75rem; margin: 0 0 .5rem; }

.ts-review[hidden], .ts-empty[hidden] { display: none !important; }
.ts-review { flex: 1 1 auto; min-height: 0; overflow: hidden; display: flex; flex-direction: column; }
.ts-review-header { display: flex; flex: 0 0 auto; justify-content: space-between; gap: 1rem; align-items: flex-start; margin-bottom: .5rem; }
.ts-review-title { margin: 0 0 .15rem; font-family: Georgia, "Times New Roman", serif; font-size: 1.35rem; line-height: 1.15; }
.ts-page-links { display: flex; gap: .8rem; font-size: .86rem; }
.ts-counter { color: var(--ts-muted); font-size: .85rem; white-space: nowrap; padding-top: .3rem; }

.ts-rulebar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: .55rem;
  background: var(--ts-surface);
  border: 1px solid var(--ts-border-subtle);
  flex: 0 0 auto;
  padding: .45rem .65rem;
  margin-bottom: .55rem;
}
.ts-replacement { font-family: monospace; font-size: .92rem; font-weight: 700; }
.ts-arrow { color: var(--ts-muted); }
.ts-rule-note { color: var(--ts-muted); font-size: .85rem; margin-left: .25rem; }

.ts-occurrences { flex: 0 0 auto; margin-bottom: .5rem; max-height: 118px; overflow-y: auto; }
.ts-occurrence-list { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: .3rem; }
.ts-occurrence {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: .65rem;
  align-items: start;
  padding: .35rem .5rem;
  border: 1px solid var(--ts-border-subtle);
  background: var(--ts-bg);
}
.ts-occurrence input { margin-top: .22rem; }
.ts-context { font-family: monospace; font-size: .84rem; line-height: 1.45; overflow-wrap: anywhere; }
.ts-context-before, .ts-context-after { color: var(--ts-muted); }
.ts-context-find { color: var(--ts-danger); text-decoration: line-through; background: rgba(179, 36, 36, .08); }
.ts-context-replace { color: var(--ts-success); font-weight: 700; background: rgba(20, 134, 109, .09); }
.ts-occurrence-help { margin: .25rem 0 0; color: var(--ts-muted); font-size: .74rem; }

.ts-workspace { flex: 1 1 auto; min-height: 0; overflow: hidden; }

.ts-panel { border: 1px solid var(--ts-border-subtle); margin: 0; background: var(--ts-bg); height: 100%; min-height: 0; overflow: hidden; }
.ts-panel[hidden] { display: none !important; }
.ts-diff-panel, .ts-editor-panel { display: flex; flex-direction: column; }
.ts-panel-heading { display: flex; justify-content: space-between; align-items: center; gap: 1rem; padding: .6rem .75rem; border-bottom: 1px solid var(--ts-border-subtle); background: var(--ts-surface); }
.ts-panel-heading h3 { margin: 0; font-size: .92rem; }
.ts-diff { flex: 1 1 auto; overflow: auto; padding: .55rem; min-height: 0; }
.ts-diff-placeholder { color: var(--ts-muted); display: grid; place-items: center; min-height: 100px; }
.ts-diff-block { border: 1px solid var(--ts-border-subtle); margin-bottom: .6rem; background: var(--ts-bg); }
.ts-diff-line { padding: .3rem .55rem; border-bottom: 1px solid var(--ts-border-subtle); background: var(--ts-surface); color: var(--ts-muted); font-size: .76rem; font-weight: 700; }
.ts-diff-comparison { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
.ts-diff-side { min-width: 0; }
.ts-diff-side + .ts-diff-side { border-left: 1px solid var(--ts-border-subtle); }
.ts-diff-side-label { padding: .25rem .55rem; color: var(--ts-muted); font-size: .72rem; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; }
.ts-diff-text, .ts-diff-context { margin: 0; padding: .55rem .65rem; white-space: pre-wrap; overflow-wrap: anywhere; font-family: monospace; font-size: .86rem; line-height: 1.5; color: var(--ts-text); }
.ts-diff-side.is-removed .ts-diff-text { background: #fff4d8; }
.ts-diff-side.is-added .ts-diff-text { background: #eaf3ff; }
.ts-diff-context { padding: .4rem .65rem; background: var(--ts-surface); color: var(--ts-muted); font-size: .8rem; border-bottom: 1px solid var(--ts-border-subtle); }
.ts-diff-comparison + .ts-diff-context { border-top: 1px solid var(--ts-border-subtle); border-bottom: 0; }
.ts-diff-highlight { padding: .05rem .08rem; color: inherit; font-weight: 700; }
.ts-diff-side.is-removed .ts-diff-highlight { background: #ffb4a8; }
.ts-diff-side.is-added .ts-diff-highlight { background: #9ee6b8; }

.ts-editor { width: 100%; flex: 1 1 auto; min-height: 0; resize: none; border: 0; padding: .8rem; font-family: monospace; font-size: .83rem; line-height: 1.45; color: var(--ts-text); background: var(--ts-bg); }
.ts-editor:focus { outline: 2px solid var(--ts-link); outline-offset: -2px; }

.ts-summary-row { display: grid; flex: 0 0 auto; grid-template-columns: auto minmax(0, 1fr); gap: .65rem; align-items: center; margin: .55rem 0; }
.ts-summary-row label { font-weight: 600; font-size: .88rem; }
.ts-input { width: 100%; min-height: 32px; padding: .38rem .5rem; border: 1px solid var(--ts-border); color: var(--ts-text); background: var(--ts-bg); }

.ts-actions { display: flex; flex: 0 0 auto; flex-wrap: wrap; align-items: center; gap: .4rem; padding-top: .55rem; border-top: 1px solid var(--ts-border-subtle); }
.ts-actions-spacer { flex: 1; }
.ts-button { appearance: none; border: 1px solid var(--ts-border); border-radius: 2px; background: var(--ts-surface); color: var(--ts-text); min-height: 34px; padding: .38rem .75rem; font: inherit; font-weight: 600; cursor: pointer; }
.ts-button:hover:not(:disabled) { background: var(--ts-surface-strong); }
.ts-button:focus-visible { outline: 2px solid var(--ts-link); outline-offset: 2px; }
.ts-button:disabled { opacity: .5; cursor: default; }
.ts-button-primary { background: var(--ts-link); border-color: var(--ts-link); color: #fff; }
.ts-button-primary:hover:not(:disabled) { background: var(--ts-link-hover); }
.ts-button-quiet { background: transparent; border-color: transparent; color: var(--ts-link); }
.ts-button-danger { color: var(--ts-danger); }

@media (max-width: 850px) {
  .ts-layout { grid-template-columns: 1fr; }
  .ts-layout { grid-template-rows: 105px minmax(0, 1fr); }
  .ts-sidebar { border-right: 0; border-bottom: 1px solid var(--ts-border-subtle); padding: .5rem .7rem; }
  .ts-main { padding: .6rem .7rem; }
  .ts-queue { display: flex; overflow-x: auto; margin-bottom: .35rem; }
  .ts-queue-item { min-width: 190px; border-top: 0 !important; border-left-width: 1px; border-bottom: 3px solid transparent; }
  .ts-queue-item.is-current { border-left-color: transparent; border-bottom-color: var(--ts-link); }
  .ts-stats, .ts-sidebar > .ts-section-title:last-of-type { display: none; }
}

@media (max-width: 560px) {
  .ts-review-header, .ts-topbar { align-items: flex-start; }
  .ts-review-header { flex-direction: column; }
  .ts-summary-row { grid-template-columns: 1fr; }
  .ts-actions-spacer { display: none; }
  .ts-button { flex: 1 1 auto; }
  .ts-diff-comparison { grid-template-columns: 1fr; }
  .ts-diff-side + .ts-diff-side { border-left: 0; border-top: 1px solid var(--ts-border-subtle); }
}
`;

  // src/ui/view.ts
  function element(tag, className) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    return node;
  }
  function link(label, href) {
    const node = element("a", "ts-link");
    node.textContent = label;
    node.href = href;
    node.target = "_blank";
    node.rel = "noopener";
    return node;
  }
  var TypoSpotterView = class {
    constructor(container) {
      this.root = element("div");
      this.status = element("div", "ts-status");
      this.queueList = element("ul", "ts-queue");
      this.empty = element("div", "ts-empty");
      this.review = element("section", "ts-review");
      this.title = element("h2", "ts-review-title");
      this.pageLinks = element("div", "ts-page-links");
      this.counter = element("div", "ts-counter");
      this.rulebar = element("div", "ts-rulebar");
      this.occurrenceList = element("div", "ts-occurrence-list");
      this.occurrenceHelp = element("p", "ts-occurrence-help");
      this.diff = element("div", "ts-diff");
      this.editor = element("textarea", "ts-editor");
      this.summary = element("input", "ts-input");
      this.refreshButton = element("button", "ts-button");
      this.editButton = element("button", "ts-button ts-button-quiet");
      this.resetButton = element("button", "ts-button ts-button-quiet");
      this.skipButton = element("button", "ts-button");
      this.excludeButton = element("button", "ts-button ts-button-quiet ts-button-danger");
      this.saveButton = element("button", "ts-button ts-button-primary");
      this.diffPanel = element("section", "ts-panel ts-diff-panel");
      this.editorPanel = element("section", "ts-panel ts-editor-panel");
      this.statsNodes = /* @__PURE__ */ new Map();
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
      topbar.append(brand, link("About and help", mw.util.getUrl(ABOUT_PAGE)));
      const layout = element("div", "ts-layout");
      const sidebar = element("aside", "ts-sidebar");
      const queueHeading = element("h2", "ts-section-title");
      queueHeading.textContent = "Review queue";
      const statsHeading = element("h2", "ts-section-title");
      statsHeading.textContent = "This session";
      const stats = element("div", "ts-stats");
      const labels = [
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
      sidebar.append(queueHeading, this.queueList, statsHeading, stats);
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
      this.root.append(topbar, layout);
      container.replaceChildren(this.root);
      document.addEventListener("keydown", (event) => this.handleShortcut(event));
    }
    setActions(actions) {
      this.actions = actions;
    }
    buildReview() {
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
      this.excludeButton.type = "button";
      this.excludeButton.textContent = "Not a typo  X";
      this.excludeButton.addEventListener("click", () => this.actions?.onExclude());
      this.editButton.type = "button";
      this.editButton.textContent = "Edit wikitext  E";
      this.editButton.addEventListener("click", () => this.toggleEditor());
      const spacer = element("span", "ts-actions-spacer");
      this.saveButton.type = "button";
      this.saveButton.textContent = "Save and next  A";
      this.saveButton.addEventListener("click", () => this.actions?.onSave(this.summary.value));
      actions.append(this.skipButton, this.excludeButton, this.editButton, spacer, this.saveButton);
      const workspace = element("div", "ts-workspace");
      workspace.append(this.diffPanel, this.editorPanel);
      this.review.append(header, this.rulebar, occurrences, workspace, summaryRow, actions);
    }
    handleShortcut(event) {
      if (event.defaultPrevented || event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target;
      if (target?.matches("input, textarea, select, button, [contenteditable='true']")) return;
      const key = event.key.toLowerCase();
      const shortcuts = {
        a: () => this.actions?.onSave(this.summary.value),
        s: () => this.actions?.onSkip(),
        x: () => this.actions?.onExclude(),
        r: () => this.actions?.onRefreshDiff(),
        e: () => this.toggleEditor()
      };
      const action = shortcuts[key];
      if (!action) return;
      event.preventDefault();
      action();
    }
    toggleEditor() {
      const showEditor = this.editorPanel.hidden;
      this.editorPanel.hidden = !showEditor;
      this.diffPanel.hidden = showEditor;
      this.editButton.textContent = showEditor ? "Show diff  E" : "Edit wikitext  E";
      if (showEditor) this.editor.focus();
    }
    setStatus(message, kind = "normal") {
      this.status.textContent = message;
      this.status.dataset.kind = kind;
    }
    showEmpty(title, message) {
      this.review.hidden = true;
      this.empty.hidden = false;
      const heading = this.empty.querySelector("h2");
      const paragraph = this.empty.querySelector("p");
      if (heading) heading.textContent = title;
      if (paragraph) paragraph.textContent = message;
    }
    renderQueue(current, queue) {
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
        rule.textContent = `${candidate.rule.find} \u2192 ${candidate.rule.replace}`;
        button.append(title, rule);
        if (!button.disabled) button.addEventListener("click", () => this.actions?.onQueueSelect(candidate));
        item.append(button);
        this.queueList.append(item);
      });
    }
    renderStats(stats) {
      Object.keys(stats).forEach((key) => {
        const node = this.statsNodes.get(key);
        if (node) node.textContent = String(stats[key]);
      });
    }
    renderProposal(proposal, queuePosition, total, summary) {
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
      arrow.textContent = "\u2192";
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
    renderOccurrences(proposal) {
      this.occurrenceList.replaceChildren();
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
        label.append(checkbox, context);
        this.occurrenceList.append(label);
      }
      this.occurrenceHelp.textContent = proposal.manuallyEdited ? "Occurrence controls are paused because the proposed wikitext was edited manually. Reset to use them again." : "Uncheck any occurrence that should remain unchanged, then refresh the diff.";
    }
    setEditorText(text) {
      if (this.editor.value !== text) this.editor.value = text;
    }
    setDiffLoading() {
      this.diff.replaceChildren();
      const placeholder = element("div", "ts-diff-placeholder");
      placeholder.textContent = "Generating the Wikipedia diff\u2026";
      this.diff.append(placeholder);
      this.setSaveEnabled(false);
    }
    setDiff(rows) {
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
    renderContext(lines) {
      if (lines.length === 0) return null;
      const context = element("pre", "ts-diff-context");
      context.textContent = lines.join("\n");
      return context;
    }
    renderDiffSide(label, value, counterpart, added) {
      const side = element("section", `ts-diff-side ${added ? "is-added" : "is-removed"}`);
      const sideLabel = element("div", "ts-diff-side-label");
      sideLabel.textContent = label;
      const content = element("pre", "ts-diff-text");
      const segments = added ? changedSegments(counterpart, value) : changedSegments(value, counterpart);
      content.append(document.createTextNode(segments.prefix));
      const changed = element("mark", "ts-diff-highlight");
      changed.textContent = added ? segments.proposed : segments.original;
      content.append(changed, document.createTextNode(segments.suffix));
      side.append(sideLabel, content);
      return side;
    }
    setDiffError(message) {
      this.diff.replaceChildren();
      const placeholder = element("div", "ts-diff-placeholder");
      placeholder.textContent = message;
      this.diff.append(placeholder);
      this.setSaveEnabled(false);
    }
    setDirty() {
      this.setDiffError("The proposal changed. Refresh the diff before saving.");
    }
    setBusy(busy) {
      this.refreshButton.disabled = busy;
      this.resetButton.disabled = busy;
      this.skipButton.disabled = busy;
      this.excludeButton.disabled = busy;
      this.editButton.disabled = busy;
      this.editor.disabled = busy;
      this.summary.disabled = busy;
      if (busy) this.saveButton.disabled = true;
    }
    setSaveEnabled(enabled) {
      this.saveButton.disabled = !enabled;
    }
  };

  // src/wikitext/proposal.ts
  function applyOccurrences(original, occurrences, selected) {
    let result = original;
    const applicable = occurrences.filter((occurrence) => selected.has(occurrence.id)).sort((left, right) => right.start - left.start);
    for (const occurrence of applicable) {
      result = result.slice(0, occurrence.start) + occurrence.replacement + result.slice(occurrence.end);
    }
    return result;
  }

  // src/wikitext/scanner.ts
  function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  function addRegexRanges(text, expression, ranges) {
    expression.lastIndex = 0;
    for (const match of text.matchAll(expression)) {
      if (match.index !== void 0) {
        ranges.push({ start: match.index, end: match.index + match[0].length });
      }
    }
  }
  function addBalancedRanges(text, open, close, ranges) {
    const stack = [];
    let index = 0;
    while (index < text.length) {
      if (text.startsWith(open, index)) {
        stack.push(index);
        index += open.length;
        continue;
      }
      if (text.startsWith(close, index) && stack.length > 0) {
        const start = stack.pop();
        if (start !== void 0 && stack.length === 0) {
          ranges.push({ start, end: index + close.length });
        }
        index += close.length;
        continue;
      }
      index += 1;
    }
    if (stack.length > 0) {
      ranges.push({ start: stack[0] ?? 0, end: text.length });
    }
  }
  function mergeRanges(ranges) {
    const sorted = ranges.filter((range) => range.end > range.start).sort((left, right) => left.start - right.start || left.end - right.end);
    const merged = [];
    for (const range of sorted) {
      const previous = merged[merged.length - 1];
      if (!previous || range.start > previous.end) {
        merged.push({ ...range });
      } else {
        previous.end = Math.max(previous.end, range.end);
      }
    }
    return merged;
  }
  function protectedRanges(text) {
    const ranges = [];
    addRegexRanges(text, /<!--[\s\S]*?(?:-->|$)/g, ranges);
    addRegexRanges(
      text,
      /<(nowiki|pre|code|syntaxhighlight|source|math|timeline|graph|score|templatedata)\b[^>]*>[\s\S]*?(?:<\/\1\s*>|$)/gi,
      ranges
    );
    addRegexRanges(text, /<ref\b[^>]*\/>/gi, ranges);
    addRegexRanges(text, /<ref\b[^>]*>[\s\S]*?(?:<\/ref\s*>|$)/gi, ranges);
    addRegexRanges(text, /https?:\/\/[^\s<>\]}|]+/gi, ranges);
    addRegexRanges(text, /\[(?:https?:)?\/\/[^\]]*(?:\]|$)/gi, ranges);
    addBalancedRanges(text, "{{", "}}", ranges);
    addBalancedRanges(text, "[[", "]]", ranges);
    addBalancedRanges(text, "{|", "|}", ranges);
    return mergeRanges(ranges);
  }
  function overlapsProtected(start, end, ranges) {
    for (const range of ranges) {
      if (range.start >= end) {
        return false;
      }
      if (range.end > start) {
        return true;
      }
    }
    return false;
  }
  function preserveCase(source, replacement) {
    if (source === source.toUpperCase()) {
      return replacement.toUpperCase();
    }
    if (source[0] === source[0]?.toUpperCase() && source.slice(1) === source.slice(1).toLowerCase()) {
      return replacement[0]?.toUpperCase() + replacement.slice(1).toLowerCase();
    }
    return replacement;
  }
  function findOccurrences(text, rule) {
    const ranges = protectedRanges(text);
    const expression = new RegExp(`\\b${escapeRegExp(rule.find)}\\b`, "gi");
    const occurrences = [];
    for (const match of text.matchAll(expression)) {
      if (match.index === void 0) {
        continue;
      }
      const start = match.index;
      const end = start + match[0].length;
      if (overlapsProtected(start, end, ranges)) {
        continue;
      }
      occurrences.push({
        id: `${rule.id}:${start}`,
        start,
        end,
        matched: match[0],
        replacement: preserveCase(match[0], rule.replace),
        before: text.slice(Math.max(0, start - 240), start),
        after: text.slice(end, Math.min(text.length, end + 240))
      });
    }
    return occurrences;
  }

  // src/app.ts
  var SEARCH_RULES_PER_BATCH = 5;
  var VALIDATION_WORKERS = 4;
  var MAX_SEARCH_BATCHES_PER_REFILL = 4;
  function errorMessage(error) {
    if (!(error instanceof TypoSpotterApiError)) {
      return error instanceof Error ? error.message : "Something went wrong.";
    }
    const known = {
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
  var TypoSpotterApp = class {
    constructor(container) {
      this.api = new MediaWikiApi();
      this.exclusions = new ExclusionStore();
      this.queue = [];
      this.seen = /* @__PURE__ */ new Set();
      this.continuations = /* @__PURE__ */ new Map();
      this.stats = { reviewed: 0, saved: 0, skipped: 0 };
      this.nextRuleIndex = 0;
      this.busy = false;
      this.loadedCount = 0;
      this.view = new TypoSpotterView(container);
      this.view.setActions({
        onOccurrenceChange: (id, selected) => this.changeOccurrence(id, selected),
        onProposalInput: (text) => this.changeProposal(text),
        onRefreshDiff: () => void this.refreshDiff(),
        onResetProposal: () => this.resetProposal(),
        onSkip: () => void this.skip(),
        onExclude: () => void this.exclude(),
        onSave: (summary) => void this.save(summary),
        onQueueSelect: (candidate) => void this.selectCandidate(candidate)
      });
    }
    async start() {
      if (!mw.config.get("wgUserName")) {
        this.view.showEmpty("Sign in required", "TypoSpotter makes edits through your Wikipedia account. Sign in, then reload this page.");
        this.view.setStatus("Not signed in", "error");
        return;
      }
      this.view.renderStats(this.stats);
      this.view.renderQueue(void 0, []);
      this.view.setStatus("Searching English Wikipedia for a small set of likely typos\u2026");
      try {
        await this.refillQueue(1);
        await this.advance();
      } catch (error) {
        this.view.showEmpty("Could not start TypoSpotter", errorMessage(error));
        this.view.setStatus(errorMessage(error), "error");
      }
    }
    candidateKey(candidate) {
      return `${candidate.pageId}:${candidate.rule.id}`;
    }
    async refillQueue(target = QUEUE_TARGET) {
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
        this.refillPromise = void 0;
      }
    }
    async buildValidatedQueue(target) {
      let batchesTried = 0;
      while (this.queue.length < target && batchesTried < MAX_SEARCH_BATCHES_PER_REFILL) {
        batchesTried += 1;
        const rules = Array.from({ length: SEARCH_RULES_PER_BATCH }, (_, offset) => {
          const index = (this.nextRuleIndex + offset) % RULES.length;
          return RULES[index];
        }).filter((rule) => Boolean(rule));
        this.nextRuleIndex = (this.nextRuleIndex + SEARCH_RULES_PER_BATCH) % RULES.length;
        const batches = await Promise.allSettled(
          rules.map((rule) => this.api.search(rule, this.continuations.get(rule.id)))
        );
        let successfulSearches = 0;
        const candidates = [];
        batches.forEach((result, index) => {
          const rule = rules[index];
          if (result.status !== "fulfilled" || !rule) return;
          successfulSearches += 1;
          if (result.value.continueToken !== void 0) {
            this.continuations.set(rule.id, result.value.continueToken);
          } else {
            this.continuations.delete(rule.id);
          }
          for (const candidate of result.value.candidates) {
            const key = this.candidateKey(candidate);
            if (isIgnoredTitle(candidate.title) || this.seen.has(key) || this.exclusions.has(candidate.pageId, candidate.rule.id)) continue;
            this.seen.add(key);
            candidates.push(candidate);
          }
        });
        if (successfulSearches === 0) {
          throw new TypoSpotterApiError("Candidate searches failed. Try reloading in a moment.", "searchfailed");
        }
        let nextIndex = 0;
        const worker = async () => {
          while (this.queue.length < target && nextIndex < candidates.length) {
            const candidate = candidates[nextIndex++];
            if (!candidate) return;
            try {
              const snapshot = await this.api.loadPage(candidate);
              const occurrences = findOccurrences(snapshot.text, candidate.rule);
              if (occurrences.length === 0) continue;
              this.queue.push({ candidate, snapshot, occurrences });
              this.view.renderQueue(this.current?.candidate, this.queue.map((item) => item.candidate));
            } catch {
            }
          }
        };
        await Promise.all(Array.from({ length: VALIDATION_WORKERS }, () => worker()));
      }
    }
    refillInBackground() {
      void this.refillQueue().catch(() => {
      });
    }
    async advance() {
      if (this.busy) return;
      this.busy = true;
      this.view.setBusy(true);
      this.proposal = void 0;
      this.diffText = void 0;
      try {
        if (this.queue.length === 0) await this.refillQueue(1);
        const prepared = this.queue.shift();
        if (prepared) {
          const { candidate, snapshot, occurrences } = prepared;
          this.current = prepared;
          this.view.renderQueue(candidate, this.queue.map((item) => item.candidate));
          this.view.setStatus(`Loading ${candidate.title}\u2026`);
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
        this.current = void 0;
        this.view.renderQueue(void 0, []);
        this.view.showEmpty("No candidates found", "The current rule batch did not return any reviewable occurrences. Reload to search again.");
        this.view.setStatus("Queue finished");
      } finally {
        this.busy = false;
        this.view.setBusy(false);
      }
    }
    changeOccurrence(id, selected) {
      if (!this.proposal || this.busy || this.proposal.manuallyEdited) return;
      if (selected) this.proposal.selected.add(id);
      else this.proposal.selected.delete(id);
      this.proposal.text = applyOccurrences(
        this.proposal.snapshot.text,
        this.proposal.occurrences,
        this.proposal.selected
      );
      this.diffText = void 0;
      this.view.setEditorText(this.proposal.text);
      this.view.setDirty();
    }
    changeProposal(text) {
      if (!this.proposal || this.busy || text === this.proposal.text) return;
      this.proposal.text = text;
      this.proposal.manuallyEdited = true;
      this.diffText = void 0;
      this.view.renderOccurrences(this.proposal);
      this.view.setDirty();
    }
    resetProposal() {
      if (!this.proposal || this.busy) return;
      this.proposal.manuallyEdited = false;
      this.proposal.text = applyOccurrences(
        this.proposal.snapshot.text,
        this.proposal.occurrences,
        this.proposal.selected
      );
      this.diffText = void 0;
      this.view.setEditorText(this.proposal.text);
      this.view.renderOccurrences(this.proposal);
      this.view.setDirty();
    }
    async refreshDiff() {
      if (!this.proposal || this.busy) return;
      if (this.proposal.text === this.proposal.snapshot.text) {
        this.diffText = void 0;
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
    async selectCandidate(candidate) {
      if (this.busy || this.current?.candidate === candidate) return;
      const index = this.queue.findIndex((item) => this.candidateKey(item.candidate) === this.candidateKey(candidate));
      if (index < 0) return;
      const [selected] = this.queue.splice(index, 1);
      if (!selected) return;
      if (this.current) this.queue.push(this.current);
      this.queue.unshift(selected);
      this.current = void 0;
      await this.advance();
    }
    async skip() {
      if (this.busy || !this.proposal) return;
      this.stats.reviewed += 1;
      this.stats.skipped += 1;
      this.view.renderStats(this.stats);
      await this.advance();
    }
    async exclude() {
      if (this.busy || !this.proposal) return;
      this.exclusions.add(this.proposal.snapshot.pageId, this.proposal.candidate.rule.id);
      this.stats.reviewed += 1;
      this.stats.skipped += 1;
      this.view.renderStats(this.stats);
      await this.advance();
    }
    async save(summary) {
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
      this.view.setStatus(`Saving ${this.proposal.snapshot.title}\u2026`);
      try {
        const revisionId = await this.api.edit(this.proposal.snapshot, this.proposal.text, summary.trim());
        this.stats.reviewed += 1;
        this.stats.saved += 1;
        this.view.renderStats(this.stats);
        this.view.setStatus(`Saved revision ${revisionId}. Loading the next candidate\u2026`, "success");
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
            const occurrences = findOccurrences(snapshot.text, candidate.rule);
            if (occurrences.length > 0) this.queue.unshift({ candidate, snapshot, occurrences });
          } catch {
          }
          await this.advance();
        } else {
          this.view.setSaveEnabled(this.diffText === this.proposal?.text);
        }
      }
    }
  };

  // src/index.ts
  async function boot() {
    if (mw.config.get("wgPageName") !== RUN_PAGE || mw.config.get("wgAction") !== "view") {
      return;
    }
    await Promise.resolve(mw.loader.using(["mediawiki.api", "mediawiki.util"]));
    document.body.classList.add("ts-active");
    const host = document.createElement("div");
    host.id = "ts-host";
    document.body.append(host);
    const app = new TypoSpotterApp(host);
    await app.start();
  }
  void boot().catch((error) => {
    console.error("TypoSpotter failed to start", error);
    mw.notify?.("TypoSpotter failed to start. Check the browser console for details.", { type: "error" });
  });
})();
// </nowiki>
