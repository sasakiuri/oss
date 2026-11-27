/** The unique, trimmed, non-empty items of comma- or line-separated text, in first-seen order. */
export function parseListItems(value: string): string[] {
  return [
    ...new Set(
      value
        .split(/[\n,]/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
}
