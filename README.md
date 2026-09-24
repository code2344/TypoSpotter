# TypoSpotter

TypoSpotter is a human-reviewed typo fixing userscript for English Wikipedia. It searches for a small catalog of likely misspellings, loads the current article wikitext, presents a MediaWiki-generated diff, and saves only after the editor explicitly approves the proposal.

Version 0.1.3 is an initial working release intended for sandbox and limited manual testing.

## Versioning

TypoSpotter uses `major.minor.patch`:

- Small fixes and refinements increment `patch`.
- Medium-sized features increment `minor`.
- Large or compatibility-breaking changes should prompt a proposed `major` increment before release.

Use one of these commands before publishing a changed release:

```sh
npm run version:patch
npm run version:minor
npm run version:major
```

The command updates `package.json`, `package-lock.json`, and version references in the project documentation. Then validate and generate the uploadable bundle:

```sh
npm run check
npm run build
```

## Review controls

TypoSpotter fills the browser viewport and keeps scrolling inside its queue, diff, and editor panes. When focus is not inside a form control, these shortcuts are available:

- `A` — save the reviewed proposal and load the next candidate
- `S` — skip the current candidate
- `X` — remember that this rule is not a typo on the current page
- `R` — regenerate the diff
- `E` — switch from the diff to the wikitext editor
- `Escape` — leave the wikitext editor and return to the diff

Queue entries are clickable, so candidates can be reviewed out of order. The current candidate returns to the queue when another one is selected. `Commonly misspelled English words` is permanently excluded from discovery because its examples are intentional.

## Build

```sh
npm install
npm run check
npm run build
```

The on-wiki bundle is generated at `dist/TypoSpotter.user.js`. Publish that file as:

```text
User:SuperCode111/TypoSpotter/ts.js
```

Add the generated `dist/common-loader.js` content to the installing editor's `common.js`. The application activates only on:

```text
User:SuperCode111/TypoSpotter/run
```

## First test

Test the bundle while logged in using a sandbox candidate before saving any mainspace edit. Confirm that the displayed diff contains only the intended typo correction and that an intervening edit causes a conflict instead of being overwritten.

The fuller product and safety design is in [RESEARCH_AND_IMPLEMENTATION_PLAN.md](RESEARCH_AND_IMPLEMENTATION_PLAN.md).
