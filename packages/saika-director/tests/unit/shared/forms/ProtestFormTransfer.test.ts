import { describe, expect, it } from 'vitest';

import { createProtestFormTransfer } from '@/shared/forms/ProtestFormTransfer';
import type { ProtestCaseDto } from '@/shared/ipc/contracts';

import { APPEAL_ID, PROTEST_ID, protestFixture } from '../../../helpers/protestFixture';

const entry = (type: ProtestCaseDto['entries'][number]['type']): ProtestCaseDto['entries'][number] => ({
  id: 'entry-1',
  caseId: PROTEST_ID,
  type,
  statement: 'Decision rationale',
  officialName: 'Recording official',
  ruleReference: '6.16',
  occurredAt: '2026-09-08T01:00:00.000Z',
  recordedAt: '2026-09-08T01:15:00.000Z',
});
const fields = (transfer: ReturnType<typeof createProtestFormTransfer>) =>
  Object.fromEntries(transfer.fields.map((field) => [field.label, field]));

describe('protest form transfer', () => {
  it('uses actual receipt time in the selected zone across the date boundary and preserves manual gaps', () => {
    const projection = fields(
      createProtestFormTransfer(
        protestFixture({
          feePaidEuro: null,
          status: 'DECIDED',
          entries: [entry('DECIDED_UPHELD'), entry('FEE_REFUNDED')],
        }),
        { timeZone: 'America/Los_Angeles', eventName: '  Air rifle  ' },
      ),
    );
    expect(projection['Receipt date']?.value).toBe('2026-09-07');
    expect(projection['Receipt time']?.value).toBe('17:10:00');
    expect(projection['Event name']).toMatchObject({ value: 'Air rifle', origin: 'entered' });
    expect(projection['Outcome for the form']?.value).toBe('Upheld');
    expect(projection['Decision explanation and cited rules']?.value).toBe('Decision rationale\n6.16');
    expect(projection['Fee disposition']?.value).toBe('Returned');
    for (const label of [
      'Fee actually received (EUR)',
      'Jury meeting date',
      'Jury meeting time',
      'Jury chairperson name',
      'Jury chairperson signature',
      'Receiving official name',
      'Notification time',
    ]) {
      expect(projection[label]).toMatchObject({ value: null, origin: 'manual' });
    }
  });

  it('does not turn a partial decision into a binary outcome or resolve contradictory fee entries', () => {
    const projection = fields(
      createProtestFormTransfer(
        protestFixture({
          feePaidEuro: 0,
          entries: [entry('DECIDED_PARTLY_UPHELD'), entry('FEE_REFUNDED'), entry('FEE_RETAINED')],
        }),
        { timeZone: 'UTC' },
      ),
    );
    expect(projection['Fee actually received (EUR)']?.value).toBe('0');
    expect(projection['Outcome for the form']?.value).toBeNull();
    expect(projection['Decision explanation and cited rules']?.value).toContain('Decision rationale');
    expect(projection['Fee disposition']?.value).toBeNull();
  });

  it('requires the matching original protest for appeals and retains its form reference', () => {
    const appeal = protestFixture({ id: APPEAL_ID, kind: 'APPEAL', parentProtestId: PROTEST_ID });
    for (const parent of [
      undefined,
      protestFixture({ scopeId: 'other-event' }),
      protestFixture({ kind: 'VERBAL' }),
      protestFixture({ id: APPEAL_ID }),
    ]) {
      expect(() => createProtestFormTransfer(appeal, { timeZone: 'UTC', parent })).toThrow('matching original');
    }
    const projection = createProtestFormTransfer(appeal, {
      timeZone: 'Asia/Tokyo',
      parent: protestFixture(),
      nation: 'JPN',
    });
    expect(projection.attachment).toEqual({ caseId: PROTEST_ID, formReference: 'P-42' });
    expect(fields(projection)['Submitting nation']).toMatchObject({ value: 'JPN', origin: 'entered' });
    expect(projection.code).toBe('AP');
  });

  it('allows another field profile without changes to the protest record or persistence', () => {
    const protest = protestFixture();
    const original = structuredClone(protest);
    const projection = createProtestFormTransfer(
      protest,
      { timeZone: 'UTC' },
      {
        code: 'LOCAL',
        kind: 'WRITTEN',
        fields: [{ fact: 'receiptTime', label: 'Time received' }],
      },
    );
    expect(projection.fields).toEqual([{ label: 'Time received', value: '00:10:00', origin: 'record' }]);
    expect(protest).toEqual(original);
    expect(() =>
      createProtestFormTransfer(protest, { timeZone: 'UTC' }, { code: 'AP', kind: 'APPEAL', fields: [] }),
    ).toThrow('does not match');
  });

  it('rejects invalid zones, verbal cases and void submissions', () => {
    expect(() => createProtestFormTransfer(protestFixture(), { timeZone: 'invalid-zone' })).toThrow();
    expect(() => createProtestFormTransfer(protestFixture({ kind: 'VERBAL' }), { timeZone: 'UTC' })).toThrow('written');
    expect(() => createProtestFormTransfer(protestFixture({ status: 'VOID' }), { timeZone: 'UTC' })).toThrow('Void');
  });
});
