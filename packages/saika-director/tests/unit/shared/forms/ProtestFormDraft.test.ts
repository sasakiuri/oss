import { describe, expect, it } from 'vitest';

import { createProtestFormDraft, assessProtestFormDraft } from '@/shared/forms/ProtestFormDraft';
import { createProtestFormTransfer } from '@/shared/forms/ProtestFormTransfer';

import { protestFixture, APPEAL_ID, PROTEST_ID } from '../../../helpers/protestFixture';

describe('official form completion', () => {
  it('separates draft entries from records and signatures from printable values', () => {
    const protest = protestFixture();
    const original = structuredClone(protest);
    const transfer = createProtestFormTransfer(protest, { timeZone: 'Asia/Tokyo' });
    const draft = createProtestFormDraft(transfer, { event: 'Air rifle', jury: 'RTS', signature: 'not a signature' });
    expect(protest).toEqual(original);
    expect(draft.fields.find((field) => field.id === 'event')).toMatchObject({ value: 'Air rifle', origin: 'entered' });
    expect(draft.fields.some((field) => field.id === 'signature')).toBe(false);
    expect(draft.fields.find((field) => field.id === 'receiptTime')?.value).toBe('09:10:00');
    expect(assessProtestFormDraft(draft, 'SUBMISSION', new Set())).toEqual([
      'Confirm Submitter signature on the signed form',
    ]);
    expect(assessProtestFormDraft(draft, 'DECISION', new Set())).toContain('Complete Jury meeting date');
  });
  it('requires the matching original protest attachment and each declared supporting document', () => {
    const transfer = createProtestFormTransfer(
      protestFixture({ id: APPEAL_ID, kind: 'APPEAL', parentProtestId: PROTEST_ID }),
      { timeZone: 'UTC', nation: 'JPN', parent: protestFixture() },
    );
    const draft = createProtestFormDraft(transfer);
    const checks = new Set(draft.signatures.map((signature) => signature.id));
    expect(assessProtestFormDraft(draft, 'SUBMISSION', checks, ['EST original'])).toEqual([
      'Confirm the original Protest Form P attachment (P-42)',
      'Confirm attachment: EST original',
    ]);
    checks.add('original-protest');
    checks.add('attachment:EST original');
    expect(assessProtestFormDraft(draft, 'SUBMISSION', checks, ['EST original'])).toEqual([]);
  });
});
