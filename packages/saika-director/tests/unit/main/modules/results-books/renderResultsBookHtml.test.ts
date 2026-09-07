// @vitest-environment jsdom
// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';

import { renderResultsBookHtml } from '@/main/modules/results-books/domain/renderResultsBookHtml';

describe('readable certified Results Book', () => {
  it('preserves tied ranks, original scores, classification, officials and revision evidence', () => {
    const html = renderResultsBookHtml({
      championship: { name: 'Example Championship', date: '2026-09-07', venue: 'Range A' },
      publicationVersion: { number: 2, bookId: 'book-2' },
      resultsCertification: {
        sourceHash: 'a'.repeat(64),
        finalizedBy: 'Results Officer',
        finalizedAt: '2026-09-07T12:00:00Z',
        signatures: [
          {
            role: 'RTS_JURY_CHAIR',
            officialName: 'Official A',
            statement: 'Reviewed',
            signedAt: '2026-09-07T11:00:00Z',
          },
        ],
      },
      finalResults: [
        {
          eventName: '10m Air Rifle',
          scope: 'QUALIFICATION',
          snapshotRevision: 'b'.repeat(64),
          rulePackId: 'ISSF:2026:AR60:QUALIFICATION',
          rulePackFingerprint: 'c'.repeat(64),
          results: [
            { rank: 1, name: 'Example A', familyName: 'A', bibNumber: '001', nationCode: 'JPN', totalScore: 632.4 },
            { rank: 1, name: 'Example B', totalScore: 632.4 },
            { rank: 0, name: 'Example C', totalScore: 0, classificationCode: 'AD_DSQ' },
          ],
        },
      ],
    });
    const document = new DOMParser().parseFromString(html, 'text/html');
    expect(document.querySelectorAll('nav a')).toHaveLength(8);
    expect(document.querySelectorAll('#results tbody tr')).toHaveLength(3);
    const ranks = [...document.querySelectorAll('#results tbody tr')].map(
      (element) => element.firstElementChild?.textContent,
    );
    expect(ranks).toEqual(['1', '1', '—']);
    expect(document.body.textContent).toContain('632.4');
    expect(document.body.textContent).toContain('AD-DSQ');
    expect(document.body.textContent).toContain('Official A');
    expect(document.body.textContent).toContain('Version 2');
    expect(document.body.textContent).toContain('b'.repeat(64));
  });

  it('renders untrusted names and statements as text with no active or remote content', () => {
    const hostile = '<script>alert(1)</script><img src="https://example.invalid/x" onerror="alert(1)">';
    const document = new DOMParser().parseFromString(
      renderResultsBookHtml({
        championship: { name: hostile },
        resultsCertification: { statement: hostile },
        finalResults: [{ eventName: hostile, results: [{ name: hostile, remarks: hostile }] }],
      }),
      'text/html',
    );
    expect(document.querySelectorAll('script, img, iframe, link, [onerror]')).toHaveLength(0);
    expect(document.body.textContent).toContain(hostile);
    expect(document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute('content')).toContain(
      "default-src 'none'",
    );
  });
});
