import { resolveContentUrl } from './paths';
import type { ContentType } from './types';

const asciiWhitespace = /[\t\n\f\r ]/;

/**
 * Rebase URL tokens without changing descriptors or separators. Follow the HTML
 * srcset token boundaries: commas inside URLs (notably data URLs) are not list
 * separators, and commas inside parenthesized descriptors are not separators.
 * Candidate validation and selection remain the browser's responsibility.
 */
export function resolveContentSrcSet(value: string, type: ContentType, slug: string): string {
  let position = 0;
  let copiedUntil = 0;
  let result = '';
  while (position < value.length) {
    while (position < value.length && (asciiWhitespace.test(value[position]!) || value[position] === ',')) {
      position += 1;
    }
    if (position === value.length) break;
    const start = position;
    while (position < value.length && !asciiWhitespace.test(value[position]!)) position += 1;
    let end = position;
    while (value[end - 1] === ',') end -= 1;
    result += value.slice(copiedUntil, start) + resolveContentUrl(value.slice(start, end), type, slug);
    copiedUntil = end;
    // Trailing commas finish a candidate without descriptors; preserve them verbatim.
    if (end < position) continue;
    let inParentheses = false;
    while (position < value.length) {
      const character = value[position++]!;
      if (character === ')') inParentheses = false;
      else if (!inParentheses && character === '(') inParentheses = true;
      else if (!inParentheses && character === ',') break;
    }
  }
  return result + value.slice(copiedUntil);
}
