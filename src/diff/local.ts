export interface LocalDiffRow {
  lineNumber: number;
  beforeContext: string[];
  original: string;
  proposed: string;
  afterContext: string[];
}

export interface ChangedSegments {
  prefix: string;
  original: string;
  proposed: string;
  suffix: string;
}

function commonPrefixLength(left: string, right: string): number {
  const limit = Math.min(left.length, right.length);
  let index = 0;
  while (index < limit && left[index] === right[index]) index += 1;
  return index;
}

function commonSuffixLength(left: string, right: string, prefixLength: number): number {
  const limit = Math.min(left.length, right.length) - prefixLength;
  let length = 0;
  while (
    length < limit &&
    left[left.length - 1 - length] === right[right.length - 1 - length]
  ) {
    length += 1;
  }
  return length;
}

export function changedSegments(original: string, proposed: string): ChangedSegments {
  const prefixLength = commonPrefixLength(original, proposed);
  const suffixLength = commonSuffixLength(original, proposed, prefixLength);
  return {
    prefix: original.slice(0, prefixLength),
    original: original.slice(prefixLength, suffixLength ? -suffixLength : undefined),
    proposed: proposed.slice(prefixLength, suffixLength ? -suffixLength : undefined),
    suffix: suffixLength ? original.slice(-suffixLength) : ""
  };
}

export function buildLocalDiff(original: string, proposed: string): LocalDiffRow[] {
  const originalLines = original.split("\n");
  const proposedLines = proposed.split("\n");

  // TypoSpotter normally changes text without changing line structure. If a
  // manual edit does add or remove lines, display the complete changed text as
  // one reviewable block instead of attempting a misleading alignment.
  if (originalLines.length !== proposedLines.length) {
    return [{
      lineNumber: 1,
      beforeContext: [],
      original,
      proposed,
      afterContext: []
    }];
  }

  const rows: LocalDiffRow[] = [];
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
