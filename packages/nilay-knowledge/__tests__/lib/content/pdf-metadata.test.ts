// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { pdfRegistrySchema } from '@/lib/content/pdf-metadata';

const old = '/content/assets/old.pdf';
const successor = '/content/assets/current.pdf';

describe('editor-maintained PDF records', () => {
  it('allows missing records and unknown values without supplying dates or evidence', () => {
    expect(pdfRegistrySchema.parse({})).toEqual({});
    expect(pdfRegistrySchema.parse({ [old]: { status: 'unverified' } })).toEqual({ [old]: { status: 'unverified' } });
  });

  it('requires explicit evidence, date, region and scope for a current assertion', () => {
    expect(pdfRegistrySchema.safeParse({ [old]: { status: 'current' } }).success).toBe(false);
    expect(
      pdfRegistrySchema.parse({
        [old]: {
          status: 'current',
          checked: '2026-09-30',
          region: 'Synthetic region',
          scope: 'Synthetic scope',
          sources: [{ title: 'Evidence', url: 'https://example.com/' }],
        },
      }),
    ).toHaveProperty(old);
  });

  it.each([
    'https://example.com/a.pdf',
    '/content/assets/a.pdf#page=2',
    '/content/assets/a.pdf?x=1',
    '/content/assets/../private.pdf',
    '/content/assets/.hidden.pdf',
    '/content/assets/a%2Fb.pdf',
  ])('rejects noncanonical destinations: %s', (url) => {
    expect(pdfRegistrySchema.safeParse({ [old]: { status: 'superseded', successor: url } }).success).toBe(false);
  });

  it('rejects self-references, revision cycles, invalid dates and unsafe evidence URLs', () => {
    for (const records of [
      { [old]: { status: 'superseded', successor: old } },
      { [old]: { status: 'superseded', successor }, [successor]: { status: 'superseded', successor: old } },
      { [old]: { status: 'historical', checked: '2026-02-30' } },
      { [old]: { status: 'historical', sources: [{ title: 'Evidence', url: 'javascript:alert(1)' }] } },
    ])
      expect(pdfRegistrySchema.safeParse(records).success).toBe(false);
  });
});
