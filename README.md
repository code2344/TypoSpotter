# TypoSpotter

TypoSpotter is a human-reviewed typo fixing userscript for English Wikipedia. It searches for a small catalog of likely misspellings, loads the current article wikitext, presents a focused review diff with surrounding context, and saves only after the editor explicitly approves the proposal.

Version 0.5.0 is an initial working release intended for sandbox and limited manual testing.

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

Queue entries are clickable, so candidates can be reviewed out of order. The current candidate returns to the queue when another one is selected. TypoSpotter replenishes the queue in the background and displays a page only after confirming that the current revision is editable and contains at least one safe occurrence. **Not a typo** beside an occurrence stores an anchor containing its source revision, original line, matched text, and surrounding-context fingerprint. The **Not typos** panel lists local decisions and publishes pending entries to `User:SuperCode111/TypoSpotter/Exclusions` in one batch. `Commonly misspelled English words` is permanently excluded from discovery because its examples are intentional.

The shared exclusions page must exist before publishing. Create `User:SuperCode111/TypoSpotter/Exclusions` with the contents of [`wikipedia/Exclusions.wikitext`](wikipedia/Exclusions.wikitext). The registry is loaded once at startup. An exclusion follows an occurrence to a later revision only when its context fingerprint has exactly one match; changed or ambiguous text returns to the review queue.

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

## Automated Wikipedia deployment

Pushes to `main` run the test suite, rebuild the userscript, verify that the committed `dist` files match the source, and deploy `dist/TypoSpotter.user.js` to `User:SuperCode111/TypoSpotter/ts.js`.

One-time setup:

1. Create a BotPassword at `https://en.wikipedia.org/wiki/Special:BotPasswords` with a distinct name such as `TypoSpotterDeploy`.
2. Select the smallest edit grant offered (normally **Create, edit, and move pages**). Do not grant sitewide JavaScript/CSS editing rights or high-volume bot access.
3. In the GitHub repository, open **Settings → Environments** and create `wikipedia-production`.
4. Add these environment secrets:
   - `WIKIPEDIA_BOT_USERNAME`: the complete generated login name, such as `SuperCode111@TypoSpotterDeploy`.
   - `WIKIPEDIA_BOT_PASSWORD`: the generated BotPassword, not the normal account password.
5. Open **Actions → Deploy to English Wikipedia** and run the workflow once, or push the next validated change to `main`.

Until both secrets exist, the workflow still validates the build but skips deployment with a warning. The deployment script refuses to create a missing target page, uses the current revision as an edit-conflict guard, skips an edit when the deployed text already matches, and never prints credentials.
