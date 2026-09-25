# TypoSpotter: research and implementation plan

## Product definition

TypoSpotter is an English Wikipedia userscript for reviewing likely spelling mistakes one page at a time. It finds a candidate page, fetches the current wikitext, proposes a narrowly scoped correction, displays a real MediaWiki diff, and waits for the editor to save, alter, or skip it. It never saves merely because a page was loaded, a timer elapsed, or a keyboard shortcut was pressed without a visible proposal.

The first version should be deliberately narrower than JavaScript Wiki Browser or AutoWikiBrowser:

- English Wikipedia, main namespace only.
- One page and one proposed edit at a time.
- A curated typo rule list, not an unrestricted find-and-replace engine.
- Every edit is reviewed and explicitly saved by the logged-in editor.
- No background editing, bulk-save mode, automatic advance-and-save, AI rewriting, or unattended operation.
- All work happens in a single dynamically updated page.

This is assisted editing under the English Wikipedia bot policy, not an autonomous bot. The distinction depends on actual operation as well as the UI: the editor must assess each proposed change, edit frequency must remain human-paced, and high-volume or low-attention use can still be treated as bot-like.

## Recommended delivery form

Start as an on-wiki userscript loaded through the editor's personal JavaScript. The dedicated application route is `User:SuperCode111/TypoSpotter/run`, with `User:SuperCode111/TypoSpotter` serving as the about, installation, and documentation page. The loader should do nothing elsewhere except optionally add a “TypoSpotter” link to the personal tools menu.

The `/run` page already contains a fallback explaining that the application replaces it when the script is installed. TypoSpotter should replace the page's normal content area after startup; it does not need to generate another fallback message.

This is the best MVP form because it:

- runs inside the editor's existing authenticated Wikipedia session;
- can use `mw.Api`, ResourceLoader, site messages, and MediaWiki's own diff styles;
- avoids handling passwords, OAuth tokens, or a separate server;
- is easy to trial privately before proposing it as a shared gadget.

Build the source locally as small modules and emit a single userscript bundle for on-wiki deployment. Do not copy VandalHandle or JWB code or visual styling. They are useful interaction references, but TypoSpotter should have its own code, identity, and workflow.

## Intended review screen

Use a restrained, Wikimedia-compatible interface rather than reproducing VandalHandle's patrol UI.

```text
+----------------------+-----------------------------------------------+
| TypoSpotter          | Article title                     4 of 28     |
|----------------------|-----------------------------------------------|
| Candidate queue      | Rule: “recieve” -> “receive”                  |
|                      | Context: ...was recieved by the council...    |
| > Current title      |                                               |
|   Next title         | [ MediaWiki two-column diff ]                 |
|   Next title         |                                               |
|                      | Proposed wikitext (editable)                  |
| Session              | [...........................................]  |
| Reviewed 4           |                                               |
| Saved 2              | Summary [Fix typo: "recieve" -> "receive"]   |
| Skipped 2            |                                               |
|                      | [Skip] [Refresh diff] [Save and next]          |
+----------------------+-----------------------------------------------+
```

The central pane is primary. The queue can collapse on narrower screens. Use normal typography, subtle borders, square-ish controls, and the current Wikimedia light/dark colour tokens where available. Status messages belong beside the affected control, not in persistent banners.

### Per-page actions

- **Save and next**: submit exactly the text currently shown in the editable proposal, then load the next candidate only after confirmed success.
- **Refresh diff**: regenerate the diff after the editor changes the proposal.
- **Skip**: record a session-only skip and advance without editing.
- **Not a typo**: remember one occurrence using its page ID, source revision, original line number, matched text, and normalized surrounding-context fingerprint. Queue decisions locally and publish an explicitly reviewed batch to `User:SuperCode111/TypoSpotter/Exclusions`.
- **Open article / history**: open normal Wikipedia views in another tab.
- **Previous**: revisit display state, but never silently undo an already saved edit.

Keyboard shortcuts can be added after the basic workflow is stable. They must be disabled while focus is in an input or editor. The save shortcut should require a modifier and should never share a key with skip/next.

## Candidate discovery

### MVP: curated rules plus CirrusSearch

Store typo rules as reviewed data, separate from application code. A rule should contain at least:

```js
{
  id: "recieve-receive",
  find: "recieve",
  replace: "receive",
  matchCase: true,
  wholeWord: true,
  note: "Unambiguous misspelling",
  enabled: true
}
```

Query `action=query&list=search` in namespace 0 using CirrusSearch's literal `insource:` syntax. Request a small page of results and follow API continuation only when the local queue needs replenishing. Exact whole-word matching belongs in the local scanner: CirrusSearch's regular-expression engine does not support JavaScript-style `\b` word boundaries, and bare regular expressions are comparatively expensive.

Example conceptually:

```text
recieve insource:"recieve"
```

Search is only a candidate generator. Search snippets are highlighted, incomplete, and based on an index that may lag the current revision. Never derive an edit from a snippet.

### Later candidate sources

- Wikipedia Typo Team lists or a maintained on-wiki rule page.
- MOSS output for broader spell-check findings. MOSS is valuable but intentionally produces false positives and classifications requiring human judgment; it should become an import adapter, not the core editing model.
- User-pasted page lists or a category/search query.

Keep a common `CandidateSource` interface so these can feed the same review pipeline:

```ts
interface CandidateSource {
  nextBatch(cursor?: string): Promise<{ candidates: Candidate[]; cursor?: string }>;
}
```

### Queue behaviour

- Deduplicate by `pageid + ruleId`.
- Keep only a small look-ahead buffer (for example 20–30 candidates).
- Fetch detail for the current item and prefetch at most the next one or two.
- Do not repeatedly search while the editor is idle.
- Validate search results against freshly fetched wikitext and the current user's edit permission before adding them to the visible queue. Search-index mismatches and pages with no safe occurrences are filtered silently during background replenishment.
- Session state may live in `sessionStorage`; durable occurrence exclusions use `mw.storage`/`localStorage` with a versioned schema. Shared exclusions are fetched once per session and relocate across revisions only on one unique context-fingerprint match.

## Safe proposal generation

The difficult part is not calling the API; it is avoiding changes to strings that merely look like prose. A global regular-expression replacement over raw wikitext is unacceptable.

For the MVP, implement a conservative wikitext range scanner. It should identify candidate spans in ordinary prose and reject or defer matches inside:

- HTML comments;
- `nowiki`, `pre`, `code`, `syntaxhighlight`, `source`, `math`, and similar literal regions;
- URLs and external-link targets;
- template names, parameter names, and parameter values;
- file names and category/link targets;
- tables and other constructs the scanner cannot confidently balance;
- quoted examples or titles when the replacement may intentionally alter a proper name.

Initially, it is acceptable to miss valid corrections. False negatives create more queue work; false positives create bad edits.

For every surviving occurrence, show surrounding context and a checked/unchecked inclusion control. Preserve the matched word's simple case form (`recieve`, `Recieve`, `RECIEVE`) when the rule allows it. If a page contains multiple instances, the editor selects each occurrence; do not automatically replace all instances merely because the first is valid.

The proposal object should retain exact offsets against the fetched revision:

```ts
interface Proposal {
  title: string;
  pageId: number;
  baseRevisionId: number;
  baseTimestamp: string;
  fetchedAt: string;
  originalText: string;
  proposedText: string;
  occurrences: Occurrence[];
  rule: TypoRule;
}
```

Apply replacements from the highest offset to the lowest so earlier offsets do not move. Any manual edit replaces `proposedText` and invalidates occurrence offsets; from that point the diff is authoritative.

## Diff and edit workflow

### Loading a candidate

Use one `action=query` request for page metadata and the latest main-slot wikitext:

- `prop=revisions|info`
- `rvprop=ids|timestamp|content`
- `rvslots=main`
- `formatversion=2`
- `curtimestamp=1`

Retain the page ID, latest revision ID, revision timestamp, content model, and request timestamp.

### Producing the preview

Generate a compact local comparison from the exact fetched and proposed strings. Show every changed line in equal-width Before and After panes, highlight the changed substring, and include up to two unchanged lines on either side. This avoids the rigid column sizing and large unchanged blocks produced by MediaWiki's native diff table while preserving the exact reviewed text.

Build the comparison entirely with DOM text nodes. Do not concatenate rule text, page titles, wikitext, or error strings into `innerHTML`.

Debounce diff refreshes after manual edits. A failed preview must disable saving until a valid preview is regenerated.

### Saving

Use `mw.Api().postWithEditToken()` with:

- `action=edit`
- the page ID (preferred) or title;
- the complete reviewed `text`;
- a concise, editable `summary`;
- `baserevid` and `basetimestamp` from the fetch;
- `starttimestamp` from the fetch request time;
- `assert=user`;
- `minor=1` by default for a genuine typo correction;
- `watchlist=preferences`;
- `maxlag=5`.

Do not set the `bot` flag. Do not send a custom change tag unless the tag has actually been created and the user's account is allowed to apply it.

Default summary format:

```text
Fix typo: "recieve" -> "receive" ([[User:SuperCode111/TypoSpotter|TS v0.6.1]])
```

Use straight ASCII quotation marks and `->` exactly as shown. The link label contains the version of the script that performed the edit and must be generated from the same version constant used by the application UI and bundle metadata rather than repeated as an unrelated string.

Immediately before submission, ensure the visible diff still corresponds to the current editor text. On success, record the returned revision ID and advance. On an edit conflict, never retry the whole-page write automatically: fetch the new revision, regenerate the proposal against it, and require review again.

Handle common API failures explicitly:

- logged out / assertion failure: stop the session;
- edit conflict: reload and re-review;
- protected page or permission failure: skip with explanation;
- abuse-filter warning: display the warning and require a second deliberate confirmation if the API permits retry;
- abuse-filter disallow, spam blacklist, CAPTCHA, or content validation failure: do not advance; offer the normal edit page as a fallback;
- maxlag or rate limit: retain the proposal and allow a later retry;
- network or bad-token errors: rely on `mw.Api` token refresh where applicable, but never report success without an edit result.

## Architecture

Keep the modules independent enough to unit-test without a live wiki:

```text
src/
  index.ts                 /run route guard and application startup
  app.ts                   state machine and orchestration
  api/mediawiki.ts         query, compare, edit, error normalization
  candidates/search.ts     CirrusSearch source and continuation
  rules/catalog.ts         curated rules and validation
  wikitext/scanner.ts      protected ranges and safe occurrences
  wikitext/proposal.ts     case preservation and offset application
  state/session.ts         queue, counters, local exclusions
  ui/shell.ts              layout and navigation
  ui/review.ts             context, editor, diff, actions
  ui/settings.ts           rule and session preferences
  styles/typospotter.css
tests/
  fixtures/                representative wikitext and API responses
  unit/
  integration/
dist/
  TypoSpotter.user.js      bundle published as User:SuperCode111/TypoSpotter/ts.js
```

Use TypeScript and a small bundler configuration. Runtime dependencies should be minimal because MediaWiki already supplies `mw.Api`, jQuery where needed, and ResourceLoader modules. A framework is unnecessary for this screen; a small explicit state machine and DOM components will be easier to audit on-wiki.

Recommended states:

```text
boot -> searching -> loading -> ready -> diffing -> ready
                                      -> saving -> saved -> loading
                                      -> conflict -> loading/re-review
                                      -> error -> ready/skipped
```

Only the `ready` state with a current, successfully rendered diff may enable Save.

## What to reuse from the attached VandalHandle script

Reuse ideas, not source:

- an `mw.Api` adapter instead of API calls scattered through UI code;
- a persistent single-page shell that swaps the current item dynamically;
- an explicit side-by-side review surface tied to the exact fetched revision;
- explicit loading, progress, and error states;
- guarded keyboard shortcuts and local preferences;
- conflict protection based on the revision that was reviewed.

Do not carry over the anti-vandal queue model, recent-changes polling, ORES/user-history data, warning/report actions, rollback code, AI integration, themes, statistics, or its visual identity. None belong in a typo-review tool.

One important improvement over the attached API wrapper is to propagate structured errors instead of catching failures and returning `null`. The application must distinguish “edit rejected”, “network failed”, and “edit succeeded”; otherwise it can advance after a failed save.

## Validation strategy

### Unit tests

Create fixtures covering:

- plain prose and multiple occurrences;
- capitalization preservation;
- templates, nested templates, comments, tags, references, wikilinks, external links, tables, and malformed wikitext;
- proper nouns, quotations, regional spelling, and intentionally misspelled titles;
- offset application and manual proposal edits;
- search continuation, deduplication, and stale results;
- API errors and state transitions, especially double-click prevention and edit conflicts.

Property-oriented tests should assert that applying no selected occurrences returns byte-identical text and that text outside selected spans never changes.

### Integration tests

Mock `mw.Api` for deterministic browser tests, then test the built script on `test.wikipedia.org` or private user sandbox pages:

1. load the dedicated route;
2. find a seeded candidate;
3. generate and visually inspect the diff;
4. edit the proposal and refresh the diff;
5. save with a base revision;
6. simulate a concurrent edit and confirm forced re-review;
7. confirm logged-out, protected-page, and API-error behaviour.

Do not test mainspace writing until the scanner, diff, and conflict path have passed sandbox testing. The initial live trial should be a small number of slow, individually checked edits.

### Accessibility and interaction checks

- Complete keyboard operation with visible focus.
- Real buttons and labels, not clickable `div` elements.
- Save/skip actions distinguishable without colour.
- Screen-reader status region for load/save results.
- Light and dark Wikimedia themes.
- No shortcut activation while typing or during an in-flight request.

## Delivery phases

### Phase 0: project foundation

- TypeScript, linting, formatter, unit test runner, and bundle task.
- Userscript loader and `User:SuperCode111/TypoSpotter/run` route guard.
- Basic Wikimedia-compatible shell with mock data.

Exit condition: the built bundle loads on a sandbox wiki route without affecting other pages.

### Phase 1: read-only review prototype

- Curated starter catalog of roughly 20 highly unambiguous typos.
- CirrusSearch source, continuation, queue, and deduplication.
- Current wikitext fetch and conservative occurrence scanner.
- Context display, editable proposal, and API-generated diff.
- Skip/not-a-typo actions; no write call yet.

Exit condition: at least 100 candidates can be reviewed without the proposal changing protected or unrelated wikitext.

### Phase 2: guarded editing

- `postWithEditToken` save path with assertion, timestamps, base revision, minor flag, watchlist preference, and maxlag.
- Edit summary control and save state lock.
- Structured handling for conflicts, permissions, filters, token/session, and network failures.
- Sandbox integration tests and a deliberately small live trial.

Exit condition: successful edits are correctly attributed and every concurrent page change triggers re-review rather than an automatic retry.

### Phase 3: usability and publication

- Keyboard controls, session progress, settings, local per-page exceptions, and queue filters.
- On-wiki documentation, feedback link, version/changelog, and source/license metadata.
- Community review of the typo catalog and operating expectations.
- Decide whether it remains a personal userscript or is proposed as a gadget.

Exit condition: documented, testable installation and a stable, human-paced editing workflow.

### Later, only after evidence from real use

- On-wiki rule updates with schema validation.
- MOSS or Typo Team import adapters.
- Limited support for safe link labels or reference prose.
- Additional language wikis, each with its own rule catalog, policy review, summaries, and localisation.

Do not add auto-save or unattended operation as a convenience feature. That would change both the safety model and likely the community approval requirements.

## Decisions to make before implementation

The following defaults are recommended and can be changed without redesigning the system:

1. **English Wikipedia only for v1.** Rule correctness and regional spelling are language/community specific.
2. **Personal userscript first.** A gadget proposal can follow working trials and documentation.
3. **Curated built-in catalog first.** It is predictable, reviewable, and easy to test; external feeds come later.
4. **Exclude uncertain wikitext regions.** Expand coverage only when fixtures demonstrate safe offset mapping.
5. **No edit tag initially.** Use an informative summary and documentation link; add a tag only through the appropriate on-wiki process.
6. **No artificial “edits per minute” target.** The interface should be responsive but the editor's review determines pace.

## Research references

- [English Wikipedia bot policy and assisted editing guidelines](https://en.wikipedia.org/wiki/Wikipedia:Bot_policy)
- [English Wikipedia AutoWikiBrowser documentation](https://en.wikipedia.org/wiki/Wikipedia:AutoWikiBrowser)
- [Wikipedia Typo Team MOSS documentation](https://en.wikipedia.org/wiki/Wikipedia:Typo_Team/moss)
- [JavaScript Wiki Browser source](https://github.com/wikimedia-gadgets/JWB)
- [MediaWiki Search API](https://www.mediawiki.org/wiki/API:Search)
- [CirrusSearch query syntax](https://www.mediawiki.org/wiki/Help:CirrusSearch)
- [MediaWiki Compare API](https://www.mediawiki.org/wiki/API:Compare)
- [MediaWiki Edit API](https://www.mediawiki.org/wiki/API:Edit)
- [MediaWiki `mw.Api` documentation](https://doc.wikimedia.org/mediawiki-core/master/js/mw.Api.html)
