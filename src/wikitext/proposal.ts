import type { Occurrence } from "../types";

export function applyOccurrences(
  original: string,
  occurrences: Occurrence[],
  selected: ReadonlySet<string>
): string {
  let result = original;
  const applicable = occurrences
    .filter((occurrence) => selected.has(occurrence.id))
    .sort((left, right) => right.start - left.start);

  for (const occurrence of applicable) {
    result =
      result.slice(0, occurrence.start) +
      occurrence.replacement +
      result.slice(occurrence.end);
  }

  return result;
}
