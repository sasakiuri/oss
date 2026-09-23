'use client';

import type { TrajectoryCardDrop } from '@/lib/schemas/trajectory';
import { fromMeters } from '@/lib/sight-adjustment';
import type { DistanceUnit, DropUnit, SpeedUnit, TrajectoryRow } from '@/lib/trajectory';
import { JOULES_PER_FOOT_POUND, fromMetersPerSecond, fromMetersToDropUnit } from '@/lib/trajectory';
import type { Language } from '@/store';

interface TrajectoryTableProps {
  rows: readonly TrajectoryRow[];
  language: Language;
  distanceUnit: DistanceUnit;
  dropUnit: DropUnit;
  /** Drop and drift as a length on the target, or as the angle a sight is turned by. */
  angle: TrajectoryCardDrop;
  speedUnit: SpeedUnit;
  /** Mach number below which a supersonic load is marked as transonic, or null when it never was. */
  transonicBelowMach: number | null;
  format: (value: number, digits?: number) => string;
  t: (ja: string, en: string) => string;
}

const speedUnitLabel: Record<SpeedUnit, string> = { mps: 'm/s', fps: 'fps' };

/**
 * The distance table. Drop and drift are shown in one unit at a time; energy follows the velocity
 * unit. It scrolls sideways in its own focusable region, with the distance column pinned.
 */
export function TrajectoryTable({
  rows,
  language,
  distanceUnit,
  dropUnit,
  angle,
  speedUnit,
  transonicBelowMach,
  format,
  t,
}: TrajectoryTableProps) {
  // Alignment and stacking are added per cell: two conflicting utilities in one class
  // attribute are settled by the stylesheet's order, not by the order they are written in.
  const headCell = 'bg-surface-container px-2 py-2 align-bottom font-medium sm:px-3';
  const bodyCell = 'px-2 py-2 text-right tabular-nums sm:px-3';
  const unitLine = 'block text-xs font-normal text-on-surface-variant';
  const column = (label: string, unit: string, key: string) => (
    <th key={key} scope="col" className={`${headCell} text-right`}>
      <span className="block">{label}</span>
      <span className={unitLine}>{unit}</span>
    </th>
  );
  const drop = t('落差', 'Drop');
  const drift = t('風偏', 'Drift');
  const offsetUnit = dropUnit === 'cm' ? 'cm' : 'inch';
  const angleUnit = angle === 'offset' ? offsetUnit : angle === 'moa' ? 'MOA' : 'mil';
  const inAngle = (meters: number, moa: number, mil: number) =>
    angle === 'offset'
      ? format(fromMetersToDropUnit(meters, dropUnit), 1)
      : angle === 'moa'
        ? format(moa, 1)
        : format(mil, 2);
  const imperial = speedUnit === 'fps';

  return (
    <div
      role="region"
      aria-label={t('距離ごとの弾道の表', 'Trajectory by distance')}
      tabIndex={0}
      className="overflow-x-auto rounded-sm border border-outline-variant"
    >
      <table className="w-full min-w-[24rem] border-collapse text-sm">
        <caption className="sr-only">
          {t(
            '距離ごとの落差、風偏、残存速度、残存エネルギー、飛行時間。落差は照準線より下が正、風偏は右が正です。',
            'Drop, drift, remaining velocity, energy and time of flight by distance. Drop is positive below the line of sight; drift is positive to the right.',
          )}
        </caption>
        <thead>
          <tr>
            <th scope="col" className={`${headCell} sticky left-0 z-20 text-left`}>
              <span className="block">{t('距離', 'Distance')}</span>
              <span className={unitLine}>{distanceUnit}</span>
            </th>
            {column(drop, angleUnit, 'drop')}
            {column(drift, angleUnit, 'drift')}
            {column(t('残存速度', 'Velocity'), speedUnitLabel[speedUnit], 'speed')}
            {column(t('エネルギー', 'Energy'), imperial ? 'ft-lb' : 'J', 'energy')}
            {column(t('飛行時間', 'Time'), 's', 'time')}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const transonic = transonicBelowMach !== null && row.mach < transonicBelowMach;
            return (
              <tr key={row.distanceMeters} className="border-t border-outline-variant">
                <th
                  scope="row"
                  className="sticky left-0 z-10 bg-surface px-2 py-2 text-left font-normal tabular-nums sm:px-3"
                >
                  {format(fromMeters(row.distanceMeters, distanceUnit), 0)}
                </th>
                <td className={bodyCell}>{inAngle(row.dropMeters, row.dropMoa, row.dropMil)}</td>
                <td className={bodyCell}>{inAngle(row.driftMeters, row.driftMoa, row.driftMil)}</td>
                <td className={bodyCell}>
                  {format(fromMetersPerSecond(row.speedMs, speedUnit), 0)}
                  {transonic && (
                    <>
                      <span aria-hidden="true"> *</span>
                      <span className="sr-only">{t('（遷音速域）', ' (transonic)')}</span>
                    </>
                  )}
                </td>
                <td className={bodyCell}>
                  {format(imperial ? row.energyJoules / JOULES_PER_FOOT_POUND : row.energyJoules, 0)}
                </td>
                <td className={bodyCell}>{format(row.timeSeconds, 3)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="sr-only" lang={language}>
        {t('横にスクロールすると残りの列を読めます。', 'Scroll sideways to read the remaining columns.')}
      </p>
    </div>
  );
}
