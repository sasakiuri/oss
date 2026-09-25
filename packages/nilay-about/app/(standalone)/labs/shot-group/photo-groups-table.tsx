'use client';

import type { OffsetUnit } from '@/lib/schemas/sight-adjustment';
import { summariseGroup, toAngularSize, type ShotImpact } from '@/lib/shot-group';

import { createFormatters, type Language } from './format';

interface PhotoGroupsTableProps {
  /** Every group on the photo in order. Null impacts are a group the scale cannot read yet. */
  groups: { current: boolean; impacts: ShotImpact[] | null }[];
  distanceMeters: number;
  bulletDiameterMm: number | null;
  language: Language;
  offsetUnit: OffsetUnit;
}

/**
 * The groups on one photo side by side, as a ladder or a seating test is read: the size of each
 * and where it landed from its own aim point. Only the extreme spread and the offset are compared
 * here; the statistics below the result are for the group being edited.
 */
export function PhotoGroupsTable({
  groups,
  distanceMeters,
  bulletDiameterMm,
  language,
  offsetUnit,
}: PhotoGroupsTableProps) {
  const { t, format, length, vertical, horizontal } = createFormatters(language, offsetUnit);
  return (
    <div className="space-y-2">
      <h3 className="text-base font-medium">{t('この写真の群の比較', 'Groups on this photo')}</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm tabular-nums">
          <thead>
            <tr className="text-left text-on-surface-variant">
              <th scope="col" className="py-1 pr-3 font-normal">
                {t('群', 'Group')}
              </th>
              <th scope="col" className="py-1 pr-3 font-normal">
                {t('発数', 'Shots')}
              </th>
              <th scope="col" className="py-1 pr-3 font-normal">
                {t('最大中心間距離', 'Extreme spread')}
              </th>
              <th scope="col" className="py-1 font-normal">
                {t('平均着弾点のズレ', 'Mean point of impact')}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant">
            {groups.map((group, index) => {
              const summary = group.impacts === null ? null : summariseGroup(group.impacts, { bulletDiameterMm });
              const spread = toAngularSize(summary?.extremeSpreadMm ?? null, distanceMeters);
              return (
                <tr key={index} aria-current={group.current || undefined}>
                  <th scope="row" className="py-1 pr-3 text-left font-medium">
                    {group.current ? t(`${index + 1}（編集中）`, `${index + 1} (editing)`) : index + 1}
                  </th>
                  <td className="py-1 pr-3">{summary === null ? '—' : format(summary.count, 0)}</td>
                  <td className="py-1 pr-3">
                    {summary?.extremeSpreadMm == null
                      ? '—'
                      : `${length(summary.extremeSpreadMm)}${spread ? ` (${format(spread.moa, 2)} MOA)` : ''}`}
                  </td>
                  <td className="py-1">
                    {summary?.mpi
                      ? t(
                          `${vertical(summary.mpi.upMm)}・${horizontal(summary.mpi.rightMm)}`,
                          `${vertical(summary.mpi.upMm)}, ${horizontal(summary.mpi.rightMm)}`,
                        )
                      : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-on-surface-variant">
        {t('ズレは群ごとの狙点から測ります。', 'Each offset is from that group’s own aim point.')}
      </p>
    </div>
  );
}
