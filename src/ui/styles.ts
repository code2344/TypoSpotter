export const STYLES = `
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
.ts-topbar-actions { display: flex; align-items: center; gap: .65rem; }
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
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: .65rem;
  align-items: start;
  padding: .35rem .5rem;
  border: 1px solid var(--ts-border-subtle);
  background: var(--ts-bg);
}
.ts-occurrence input { margin-top: .22rem; }
.ts-occurrence-exclude { align-self: start; white-space: nowrap; }
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

.ts-exclusions-panel {
  position: absolute;
  inset: 52px 0 0 auto;
  z-index: 20;
  width: min(430px, 100vw);
  display: flex;
  flex-direction: column;
  padding: 1rem;
  border-left: 1px solid var(--ts-border-subtle);
  background: var(--ts-bg);
  box-shadow: -8px 0 20px rgba(0, 0, 0, .12);
}
.ts-exclusions-panel[hidden] { display: none !important; }
.ts-exclusions-header { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
.ts-exclusions-header h2 { margin: 0; font: 1.35rem/1.2 Georgia, "Times New Roman", serif; }
.ts-exclusions-description { margin: .5rem 0 .8rem; color: var(--ts-muted); font-size: .86rem; }
.ts-exclusions-list { flex: 1 1 auto; min-height: 0; overflow: auto; border-top: 1px solid var(--ts-border-subtle); }
.ts-exclusion-row { display: flex; justify-content: space-between; gap: .75rem; align-items: center; padding: .65rem 0; border-bottom: 1px solid var(--ts-border-subtle); }
.ts-exclusion-title { font-weight: 600; }
.ts-exclusion-rule, .ts-exclusions-empty { color: var(--ts-muted); font-size: .8rem; }
.ts-exclusions-footer { display: flex; justify-content: space-between; gap: .6rem; flex: 0 0 auto; padding-top: .8rem; }

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
