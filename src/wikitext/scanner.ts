import type { Occurrence, TypoRule } from "../types";

interface Range {
  start: number;
  end: number;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function addRegexRanges(text: string, expression: RegExp, ranges: Range[]): void {
  expression.lastIndex = 0;
  for (const match of text.matchAll(expression)) {
    if (match.index !== undefined) {
      ranges.push({ start: match.index, end: match.index + match[0].length });
    }
  }
}

function addBalancedRanges(
  text: string,
  open: string,
  close: string,
  ranges: Range[]
): void {
  const stack: number[] = [];
  let index = 0;

  while (index < text.length) {
    if (text.startsWith(open, index)) {
      stack.push(index);
      index += open.length;
      continue;
    }

    if (text.startsWith(close, index) && stack.length > 0) {
      const start = stack.pop();
      if (start !== undefined && stack.length === 0) {
        ranges.push({ start, end: index + close.length });
      }
      index += close.length;
      continue;
    }

    index += 1;
  }

  // An unclosed construct is uncertain, so protect everything after it.
  if (stack.length > 0) {
    ranges.push({ start: stack[0] ?? 0, end: text.length });
  }
}

function mergeRanges(ranges: Range[]): Range[] {
  const sorted = ranges
    .filter((range) => range.end > range.start)
    .sort((left, right) => left.start - right.start || left.end - right.end);
  const merged: Range[] = [];

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

export function protectedRanges(text: string): Range[] {
  const ranges: Range[] = [];

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

function overlapsProtected(start: number, end: number, ranges: Range[]): boolean {
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

function replacementForMatch(match: RegExpMatchArray, rule: TypoRule): string {
  if (!rule.regex) return preserveCase(match[0], rule.replace);
  // Apply AWB's capture-group replacement syntax to the individual match.
  const single = new RegExp(rule.find, "u");
  return match[0].replace(single, rule.replace);
}

export function preserveCase(source: string, replacement: string): string {
  if (source === source.toUpperCase()) {
    return replacement.toUpperCase();
  }
  if (source[0] === source[0]?.toUpperCase() && source.slice(1) === source.slice(1).toLowerCase()) {
    return replacement[0]?.toUpperCase() + replacement.slice(1).toLowerCase();
  }
  return replacement;
}

export function findOccurrences(text: string, rule: TypoRule): Occurrence[] {
  const ranges = protectedRanges(text);
  let expression: RegExp;
  try {
    expression = rule.regex ? new RegExp(rule.find, "giu") : new RegExp(`\\b${escapeRegExp(rule.find)}\\b`, "giu");
  } catch {
    return [];
  }
  const occurrences: Occurrence[] = [];

  for (const match of text.matchAll(expression)) {
    if (match.index === undefined) {
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
      replacement: replacementForMatch(match, rule),
      before: text.slice(Math.max(0, start - 240), start),
      after: text.slice(end, Math.min(text.length, end + 240))
    });
  }

  return occurrences;
}
