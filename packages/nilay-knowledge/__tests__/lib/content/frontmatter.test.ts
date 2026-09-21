import { describe, expect, it } from 'vitest';

import { parseFrontmatter } from '@/lib/content/frontmatter';

const source = 'articles/example/index.md';
const metadata = { title: '  題名  ', published: '2024-02-29', tags: [' 記事 '] };

describe('frontmatter validation', () => {
  it('preserves text, strips unknown fields and omits undefined optional fields', () => {
    expect(parseFrontmatter({ ...metadata, updated: undefined, image: undefined, extra: true }, source)).toEqual(
      metadata,
    );
    expect(parseFrontmatter({ ...metadata, tags: [] }, source).tags).toEqual([]);
  });

  it.each([
    '2024-02-29',
    '2024-02-29T12:30:45Z',
    '2024-02-29T12:30:45.123+09:00',
    '2024-02-29T23:30:45-09:00',
    '0000-02-29',
  ])('preserves supported date %s in both publication fields', (date) => {
    expect(parseFrontmatter({ ...metadata, published: date, updated: date }, source)).toMatchObject({
      published: date,
      updated: date,
    });
  });

  it.each([null, [], 'text', 1, undefined])('rejects a non-mapping value %j', (input) => {
    expect(() => parseFrontmatter(input, source)).toThrow(`${source}: frontmatter must be a mapping`);
  });

  it.each([
    [undefined, 'a non-empty string'],
    ['', 'a non-empty string'],
    ['  ', 'a non-empty string'],
    [false, 'a non-empty string'],
    ['invalid', 'an ISO date or timestamp with a timezone'],
    ['2024-13-01', 'an ISO date or timestamp with a timezone'],
    ['2024-01-01T12:00:00', 'an ISO date or timestamp with a timezone'],
    ['2024-01-01T24:00:00Z', 'an ISO date or timestamp with a timezone'],
    ['2023-02-29', 'a valid calendar date'],
    ['2024-02-30T23:00:00-09:00', 'a valid calendar date'],
  ])('reports the source and date constraint for %j', (published, expected) => {
    expect(() => parseFrontmatter({ ...metadata, published }, source)).toThrow(
      `${source}: published must be ${expected}`,
    );
  });

  it.each([null, 'tag', [1], [' ']])('reports malformed tags %j', (tags) => {
    expect(() => parseFrontmatter({ ...metadata, tags }, source)).toThrow(
      `${source}: tags must be an array of non-empty strings`,
    );
  });

  it('reports the first invalid field in content order', () => {
    expect(() => parseFrontmatter({ title: '', published: '', tags: null }, source)).toThrow(
      `${source}: title must be a non-empty string`,
    );
    expect(() => parseFrontmatter({ ...metadata, tags: null, updated: '' }, source)).toThrow(
      `${source}: tags must be an array of non-empty strings`,
    );
  });
});
