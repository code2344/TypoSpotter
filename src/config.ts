export const VERSION = __TYPOSPOTTER_VERSION__;
export const RUN_PAGE = "User:SuperCode111/TypoSpotter/run";
export const ABOUT_PAGE = "User:SuperCode111/TypoSpotter";
export const EXCLUSIONS_KEY = "TypoSpotter-exclusions-v1";
export const COMMUNITY_EXCLUSIONS_PAGE = "User:SuperCode111/TypoSpotter/Exclusions";
export const QUEUE_TARGET = 24;
export const IGNORED_TITLES = new Set([
  "commonly misspelled english words"
]);

export function isIgnoredTitle(title: string): boolean {
  return IGNORED_TITLES.has(title.trim().replaceAll("_", " ").toLowerCase());
}

export function editSummary(find: string, replacement: string): string {
  return `Fix typo: "${find}" -> "${replacement}" ([[${ABOUT_PAGE}|TS v${VERSION}]])`;
}
