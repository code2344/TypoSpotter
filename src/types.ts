export interface TypoRule {
  id: string;
  find: string;
  replace: string;
  note: string;
  regex?: boolean;
  search?: string;
}

export interface Candidate {
  pageId: number;
  title: string;
  rule: TypoRule;
}

export interface PageSnapshot {
  pageId: number;
  title: string;
  revisionId: number;
  baseTimestamp: string;
  startTimestamp: string;
  contentModel: string;
  text: string;
}

export interface Occurrence {
  id: string;
  start: number;
  end: number;
  matched: string;
  replacement: string;
  before: string;
  after: string;
}

export interface Proposal {
  candidate: Candidate;
  snapshot: PageSnapshot;
  occurrences: Occurrence[];
  selected: Set<string>;
  text: string;
  manuallyEdited: boolean;
}

export interface PreparedCandidate {
  candidate: Candidate;
  snapshot: PageSnapshot;
  occurrences: Occurrence[];
}

export interface ExclusionEntry {
  key: string;
  scope: "page" | "occurrence";
  pageId: number;
  title: string;
  ruleId: string;
  find: string;
  replacement: string;
  revisionId?: number;
  lineNumber?: number;
  matched?: string;
  before?: string;
  after?: string;
  contextHash?: string;
  reason?: string;
  createdAt: string;
  pending: boolean;
}

export interface CommunityExclusionDocument {
  version: 1;
  exclusions: ExclusionEntry[];
}

export interface SessionStats {
  reviewed: number;
  saved: number;
  skipped: number;
}

export interface SearchBatch {
  candidates: Candidate[];
  continueToken?: number;
}
