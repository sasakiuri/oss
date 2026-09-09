// @vitest-environment node
import { createHash } from 'node:crypto';

import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';

import { fillProtestPdf } from '@/renderer/infrastructure/forms/ProtestPdfWriter';
import type { ProtestFormDraft } from '@/shared/forms/ProtestFormDraft';
import type { ProtestPdfLayout } from '@/shared/forms/ProtestPdfLayouts';

async function fixture() {
  const pdf = await PDFDocument.create();
  pdf.addPage([595.276, 841.89]);
  const original = await pdf.save();
  const profile: ProtestPdfLayout = {
    code: 'P',
    sha256: createHash('sha256').update(original).digest('hex'),
    pages: 1,
    width: 595.276,
    height: 841.89,
    boxes: [{ field: 'reason', page: 0, x: 45, top: 100, width: 400, height: 40 }],
  };
  const draft: ProtestFormDraft = {
    code: 'P',
    caseId: 'case-1',
    fields: [
      {
        id: 'reason',
        label: 'Reason',
        value: 'Please review the interruption.',
        phase: 'SUBMISSION',
        origin: 'record',
      },
    ],
    signatures: [],
    attachment: null,
  };
  return { original, profile, draft };
}
describe('official protest PDF writer', () => {
  it('fills a selected known template without altering the original and identifies the output as a draft', async () => {
    const { original, profile, draft } = await fixture();
    const before = new Uint8Array(original);
    const output = await fillProtestPdf(original, draft, undefined, [profile]);
    const reopened = await PDFDocument.load(output);
    expect(reopened.getTitle()).toBe('Draft Form P - case-1');
    expect(reopened.getPageCount()).toBe(1);
    expect(original).toEqual(before);
    expect(output).not.toEqual(original);
  });
  it('rejects wrong originals, mismatched form kinds, overflowing entries and unsupported glyphs', async () => {
    const { original, profile, draft } = await fixture();
    await expect(fillProtestPdf(original, draft)).rejects.toThrow('does not match');
    await expect(fillProtestPdf(original, { ...draft, code: 'AP' }, undefined, [profile])).rejects.toThrow(
      'does not match',
    );
    draft.fields[0]!.value = 'long text '.repeat(1000);
    await expect(fillProtestPdf(original, draft, undefined, [profile])).rejects.toThrow('no text has been truncated');
    draft.fields[0]!.value = '\u65e5\u672c';
    await expect(fillProtestPdf(original, draft, undefined, [profile])).rejects.toThrow('font that supports');
  });
  it('does not convert a partly upheld decision to a binary checkbox', async () => {
    const { original, profile, draft } = await fixture();
    draft.fields = [{ ...draft.fields[0]!, id: 'decision', value: 'Partly upheld' }];
    profile.boxes = [{ ...profile.boxes[0]!, field: 'decision', when: 'Upheld' }];
    await expect(fillProtestPdf(original, draft, undefined, [profile])).rejects.toThrow('partial outcome');
  });
});
