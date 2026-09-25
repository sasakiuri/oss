import { describe, expect, it } from 'vitest';

import { periodProblem, plannedQuantityText, rowProblem, totalsByKind } from '@/lib/ammo-purchase-plan';
import { ammoPlanSettingsSchema, type AmmoPlanRow, type AmmoPlanSettings } from '@/lib/schemas/ammo-purchase-plan';

const row = (changes: Partial<AmmoPlanRow>): AmmoPlanRow => ({
  id: 'r',
  from: '2026-11-15',
  to: '2027-02-15',
  kind: 'cartridge',
  name: '12番',
  quantity: 100,
  reason: '狩猟',
  place: '',
  note: '',
  ...changes,
});

describe('periodProblem (別記様式第二号 備考 3)', () => {
  it('accepts a period of up to one year counted from its first day', () => {
    expect(periodProblem('2026-10-01', '2027-09-30')).toBeNull();
    expect(periodProblem('2026-10-01', '2027-10-01')).toBe('overOneYear');
    expect(periodProblem('2026-10-01', '2026-09-30')).toBe('order');
    expect(periodProblem('', '2026-09-30')).toBe('missing');
  });
});

describe('rowProblem', () => {
  it('keeps each planned time inside the acquisition period', () => {
    expect(rowProblem(row({}), '2026-10-01', '2027-09-30')).toBeNull();
    expect(rowProblem(row({ to: '2027-10-15' }), '2026-10-01', '2027-09-30')).toBe('outsidePeriod');
    expect(rowProblem(row({ from: '' }), '2026-10-01', '2027-09-30')).toBe('dates');
    expect(rowProblem(row({ to: '2026-11-01' }), '2026-10-01', '2027-09-30')).toBe('order');
  });
});

describe('totalsByKind', () => {
  it('adds up each kind and compares it with the quantity applied for', () => {
    const settings: AmmoPlanSettings = {
      periodFrom: '2026-10-01',
      periodTo: '2027-09-30',
      requested: { cartridge: 250, blank: null, primer: null, smokeless: 500, blackPowder: null },
      rows: [
        row({ id: 'a', quantity: 100 }),
        row({ id: 'b', quantity: 150, name: '20番', reason: '標的射撃' }),
        row({ id: 'c', kind: 'smokeless', name: '', quantity: 400 }),
      ],
    };
    expect(ammoPlanSettingsSchema.safeParse(settings).success).toBe(true);
    expect(totalsByKind(settings)).toEqual([
      { kind: 'cartridge', planned: 250, requested: 250, difference: 0, names: ['12番', '20番'] },
      { kind: 'smokeless', planned: 400, requested: 500, difference: -100, names: [] },
    ]);
  });
});

describe('plannedQuantityText (別紙 備考 2)', () => {
  it('writes the kind, name, quantity and reason', () => {
    expect(plannedQuantityText(row({ quantity: 1200 }))).toBe('実包（12番） 1,200個 狩猟');
    expect(plannedQuantityText(row({ kind: 'smokeless', name: '', quantity: 400, reason: '' }))).toBe(
      '無煙火薬 400グラム',
    );
  });
});
