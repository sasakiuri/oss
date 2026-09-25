/**
 * The consumption (purchase) plan attached to an application to acquire hunting-gun cartridges and
 * powders (猟銃用火薬類等の譲渡、譲受け、輸入及び消費に関する内閣府令 別記様式第二号 と 別紙).
 *
 * The form asks for the planned times, quantities with their reason, places and remarks, and says the
 * acquisition period must not exceed one year (備考 3). Nothing else about the plan is set in law, so
 * the tool totals what the reader plans, checks it against the period and the quantities applied for,
 * and prints the sheet. Read on e-Gov on AMMO_PLAN_CHECKED_ON.
 */

import { isIsoDate, lastDayOfYears } from './calendar-days';
import type { AmmoKind, AmmoPlanRow, AmmoPlanSettings } from './schemas/ammo-purchase-plan';

export const AMMO_PLAN_CHECKED_ON = '2026-09-24';
export const AMMO_PLAN_ORDINANCE_URL = 'https://laws.e-gov.go.jp/law/341M50000002046';

export const AMMO_KIND_LABELS: Record<AmmoKind, { name: string; unit: string }> = {
  cartridge: { name: '実包', unit: '個' },
  blank: { name: '空包', unit: '個' },
  primer: { name: '銃用雷管', unit: '個' },
  smokeless: { name: '無煙火薬', unit: 'グラム' },
  blackPowder: { name: '黒色猟用火薬', unit: 'グラム' },
};

export type PeriodProblem = 'missing' | 'order' | 'overOneYear';

/** 備考 3「譲受期間は、1年を超えないこと」: a period counted from its first day, ending within one year. */
export function periodProblem(from: string, to: string): PeriodProblem | null {
  if (!isIsoDate(from) || !isIsoDate(to)) return 'missing';
  if (to < from) return 'order';
  if (to > lastDayOfYears(from, 1)) return 'overOneYear';
  return null;
}

export type RowProblem = 'dates' | 'order' | 'outsidePeriod';

export function rowProblem(row: AmmoPlanRow, periodFrom: string, periodTo: string): RowProblem | null {
  if (!isIsoDate(row.from) || !isIsoDate(row.to)) return 'dates';
  if (row.to < row.from) return 'order';
  if (isIsoDate(periodFrom) && isIsoDate(periodTo) && (row.from < periodFrom || row.to > periodTo))
    return 'outsidePeriod';
  return null;
}

export interface KindTotal {
  kind: AmmoKind;
  planned: number;
  requested: number | null;
  /** Planned minus requested. Null when nothing was requested for the kind. */
  difference: number | null;
  /** The names planned under this kind, in the order first entered. */
  names: string[];
}

export function totalsByKind(settings: AmmoPlanSettings): KindTotal[] {
  return (Object.keys(AMMO_KIND_LABELS) as AmmoKind[])
    .map((kind) => {
      const rows = settings.rows.filter((row) => row.kind === kind);
      const planned = rows.reduce((sum, row) => sum + row.quantity, 0);
      const requested = settings.requested[kind];
      const names = [...new Set(rows.map((row) => row.name.trim()).filter(Boolean))];
      return { kind, planned, requested, difference: requested === null ? null : planned - requested, names };
    })
    .filter((total) => total.planned > 0 || total.requested !== null);
}

/** The text of the 予定数量 column: kind, name, quantity and reason, as 備考 2 of the sheet asks. */
export function plannedQuantityText(row: AmmoPlanRow): string {
  const label = AMMO_KIND_LABELS[row.kind];
  const name = row.name.trim() ? `（${row.name.trim()}）` : '';
  const reason = row.reason.trim() ? ` ${row.reason.trim()}` : '';
  return `${label.name}${name} ${row.quantity.toLocaleString('ja-JP')}${label.unit}${reason}`;
}
