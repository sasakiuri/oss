import type { ContentFrontmatter } from './types';

export function parseFrontmatter(input: unknown, source: string): ContentFrontmatter {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new Error(`${source}: frontmatter must be a mapping`);
  }
  const data = input as Record<string, unknown>;
  function invalid(field: string, expected: string): never {
    throw new Error(`${source}: ${field} must be ${expected}`);
  }

  function text(field: string): string {
    const value = data[field];
    if (typeof value !== 'string' || value.trim().length === 0) {
      invalid(field, 'a non-empty string');
    }
    return value;
  }

  function date(field: string): string {
    const value = text(field);
    const match =
      /^(\d{4})-(\d{2})-(\d{2})(?:T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d))?$/.exec(
        value,
      );
    if (!match || !Number.isFinite(Date.parse(value))) {
      invalid(field, 'an ISO date or timestamp with a timezone');
    }
    // Date.parse normalizes impossible dates such as February 30.
    const calendarDate = new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00Z`);
    if (calendarDate.toISOString().slice(0, 10) !== value.slice(0, 10)) {
      invalid(field, 'a valid calendar date');
    }
    return value;
  }

  const title = text('title');
  const published = date('published');
  const tags = data.tags;
  if (!Array.isArray(tags) || !tags.every((tag): tag is string => typeof tag === 'string' && tag.trim().length > 0)) {
    invalid('tags', 'an array of non-empty strings');
  }

  return {
    title,
    published,
    tags,
    ...(data.updated !== undefined ? { updated: date('updated') } : {}),
    ...(data.image !== undefined ? { image: text('image') } : {}),
  };
}
