export interface TypoRule {
  id: string;
  find: string;
  replace: string;
  note: string;
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

export interface SessionStats {
  reviewed: number;
  saved: number;
  skipped: number;
}

export interface SearchBatch {
  candidates: Candidate[];
  continueToken?: number;
}
