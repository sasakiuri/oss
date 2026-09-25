'use client';

import { useMemo } from 'react';

import { NumberField, ResultFigure, SelectField } from '@/components/labs';
import { PUBLISHED_GROUP_SIZE_LIMIT } from '@/lib/group-statistics';
import {
  angleToRadians,
  hitProbabilityReport,
  sigmaFromExtremeSpread,
  type DispersionInput,
} from '@/lib/hit-probability';
import { labsTool } from '@/lib/labs-tools';
import { fromMeters, toMeters } from '@/lib/sight-adjustment';
import { dropUnitToMeters, fromMetersToDropUnit, type TrajectoryInput } from '@/lib/trajectory';

import { blankHitProbability, useTrajectoryStore } from './_store';

interface HitProbabilitySectionProps {
  input: TrajectoryInput;
  inputInvalid: boolean;
  /** The distances of the table above, in metres. */
  distancesMeters: readonly number[];
  t: (ja: string, en: string) => string;
  format: (value: number, digits?: number) => string;
}

/**
 * The chance of a hit on the target circle at each distance of the table, and the furthest
 * distance at which it stays at the level the shooter asks of a shot. The circle is the table's own
 * target radius; the spread is the group and the errors of the day.
 */
export function HitProbabilitySection({ input, inputInvalid, distancesMeters, t, format }: HitProbabilitySectionProps) {
  const saved = useTrajectoryStore((state) => state.hitProbability);
  // Not entered: the fields open blank and the section asks for them, rather than guessing a spread.
  const entered = saved !== undefined;
  const settings = saved ?? blankHitProbability;
  const setHitProbability = useTrajectoryStore((state) => state.setHitProbability);
  const nonNegative = (value: number) => Number.isFinite(value) && value >= 0;
  const groupInvalid = !nonNegative(settings.groupSize);
  const shotsInvalid =
    settings.groupMeasure === 'extreme-spread' &&
    (!Number.isInteger(settings.groupShots) ||
      settings.groupShots < 2 ||
      settings.groupShots > PUBLISHED_GROUP_SIZE_LIMIT);
  const velocityInvalid = !nonNegative(settings.velocitySd);
  const windInvalid = !nonNegative(settings.windSd);
  const rangeInvalid = !nonNegative(settings.rangeSd);
  const thresholdInvalid = !Number.isFinite(settings.threshold) || settings.threshold <= 0 || settings.threshold >= 100;
  const invalid =
    inputInvalid || groupInvalid || shotsInvalid || velocityInvalid || windInvalid || rangeInvalid || thresholdInvalid;

  const groupSigma =
    settings.groupMeasure === 'sigma'
      ? settings.groupSize
      : sigmaFromExtremeSpread(settings.groupSize, settings.groupShots);
  const dispersion: DispersionInput | null =
    groupSigma === null
      ? null
      : {
          groupSigmaRadians: angleToRadians(groupSigma, settings.groupUnit),
          velocitySd: { value: settings.velocitySd, unit: input.muzzleSpeed.unit },
          windSd: { value: settings.windSd, unit: input.wind.unit },
          rangeSdMeters: toMeters(settings.rangeSd, input.distanceUnit),
        };
  const radiusMeters = dropUnitToMeters(input.vitalRadius, input.dropUnit);
  const maxMeters = toMeters(input.maxRange, input.distanceUnit);

  const report = useMemo(
    () =>
      invalid || dispersion === null
        ? null
        : hitProbabilityReport(
            input,
            dispersion,
            radiusMeters,
            settings.threshold / 100,
            distancesMeters.filter((meters) => meters > 2),
            maxMeters,
          ),
    // The dispersion is rebuilt from the settings on every render; its parts are the dependencies.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [invalid, input, settings, radiusMeters, distancesMeters, maxMeters],
  );
  const rows = report?.rows ?? null;
  const range = report?.range ?? null;

  const inDistance = (meters: number) => `${format(fromMeters(meters, input.distanceUnit), 0)} ${input.distanceUnit}`;
  const angleLabel = settings.groupUnit === 'mil' ? 'mil' : 'MOA';
  const speedLabel = input.muzzleSpeed.unit === 'mps' ? 'm/s' : 'fps';
  const windLabel = input.wind.unit === 'mps' ? 'm/s' : 'mph';
  const nonNegativeError = t('0 以上の数値を入力してください。', 'Enter a number of zero or more.');
  const rangeValue =
    range === null
      ? '—'
      : range.kind === 'none'
        ? t('なし', 'None')
        : range.kind === 'beyond'
          ? t(`${inDistance(range.rangeMeters)} 以上`, `${inDistance(range.rangeMeters)} or more`)
          : inDistance(range.rangeMeters);
  const rangeNote =
    range === null
      ? t('入力を確認してください。', 'Check the fields.')
      : range.kind === 'none'
        ? t('最も近い距離でもこの確率に届きません。', 'Even the nearest distance falls short of this chance.')
        : range.kind === 'beyond'
          ? t('表の最大距離まで、この確率以上で当たります。', 'The chance holds out to the table’s furthest distance.')
          : range.kind === 'unreached'
            ? t('この先は弾が届きません。', 'The bullet does not carry further than this.')
            : t(
                `半径 ${format(input.vitalRadius, 2)} ${input.dropUnit} の円に ${format(settings.threshold, 1)} % 以上で当たる最大距離。`,
                `Furthest distance with at least a ${format(settings.threshold, 1)} % chance on the ${format(input.vitalRadius, 2)} ${input.dropUnit} circle.`,
              );
  const largest = (row: NonNullable<NonNullable<typeof rows>[number]>) => {
    const parts = [
      { key: t('群', 'group'), value: row.parts.group },
      { key: t('初速', 'velocity'), value: row.parts.velocity },
      { key: t('風', 'wind'), value: row.parts.wind },
      { key: t('距離', 'distance'), value: row.parts.range },
    ];
    return parts.reduce((best, part) => (part.value > best.value ? part : best)).key;
  };

  return (
    <>
      {!entered && (
        <p className="rounded-sm bg-surface-container p-4 text-sm">
          {t('未入力です。すべての欄を入力すると計算します。', 'Not entered yet. Fill in every field to work it out.')}
        </p>
      )}
      <p className="text-sm text-on-surface-variant">
        {t(
          `的は「表の距離と的の半径」で決めた半径 ${format(input.vitalRadius, 2)} ${input.dropUnit} の円です。`,
          `The target is the ${format(input.vitalRadius, 2)} ${input.dropUnit} radius set under “Table range and target radius”.`,
        )}
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          label={t('群の大きさの表し方', 'Group given as')}
          value={settings.groupMeasure}
          onChange={(value) => setHitProbability({ groupMeasure: value as 'sigma' | 'extreme-spread' })}
          options={[
            { value: 'extreme-spread', label: t('1 群の最大中心間距離', 'Extreme spread of one group') },
            { value: 'sigma', label: t('標準偏差 σ（レイリー）', 'Standard deviation σ (Rayleigh)') },
          ]}
          hint={t(
            `σ は「${labsTool('shot-group').title.ja}」の統計に表示されます。`,
            `σ is shown in the statistics of the ${labsTool('shot-group').title.en}.`,
          )}
        />
        <NumberField
          label={settings.groupMeasure === 'sigma' ? t('群の σ', 'Group σ') : t('群の大きさ', 'Group size')}
          value={settings.groupSize}
          onChange={(groupSize) => setHitProbability({ groupSize })}
          units={{
            value: settings.groupUnit,
            label: t('群の角度の単位', 'Group angle unit'),
            options: [
              { value: 'moa', label: 'MOA' },
              { value: 'mil', label: 'mil' },
            ],
            onChange: (groupUnit: 'moa' | 'mil') => setHitProbability({ groupUnit }),
          }}
          min={0}
          invalid={groupInvalid}
          errorText={nonNegativeError}
        />
        {settings.groupMeasure === 'extreme-spread' && (
          <NumberField
            label={t('群の発数', 'Shots in the group')}
            value={settings.groupShots}
            onChange={(groupShots) => setHitProbability({ groupShots })}
            min={2}
            max={PUBLISHED_GROUP_SIZE_LIMIT}
            step={1}
            invalid={shotsInvalid}
            errorText={t(
              `2 から ${PUBLISHED_GROUP_SIZE_LIMIT} の整数を入力してください。`,
              `Enter a whole number from 2 to ${PUBLISHED_GROUP_SIZE_LIMIT}.`,
            )}
          />
        )}
        <NumberField
          label={t('初速の標準偏差', 'Velocity SD')}
          unit={speedLabel}
          value={settings.velocitySd}
          onChange={(velocitySd) => setHitProbability({ velocitySd })}
          min={0}
          invalid={velocityInvalid}
          errorText={nonNegativeError}
          hint={t(
            `「${labsTool('velocity-spread').title.ja}」の SD`,
            `The SD from the ${labsTool('velocity-spread').title.en}`,
          )}
        />
        <NumberField
          label={t('風速の読み違い（標準偏差）', 'Wind reading error (SD)')}
          unit={windLabel}
          value={settings.windSd}
          onChange={(windSd) => setHitProbability({ windSd })}
          min={0}
          invalid={windInvalid}
          errorText={nonNegativeError}
          hint={t('真横の風として数えます', 'Counted as a full value wind')}
        />
        <NumberField
          label={t('距離の見積もり誤差（標準偏差）', 'Distance error (SD)')}
          unit={input.distanceUnit}
          value={settings.rangeSd}
          onChange={(rangeSd) => setHitProbability({ rangeSd })}
          min={0}
          invalid={rangeInvalid}
          errorText={nonNegativeError}
        />
        <NumberField
          label={t('求める命中確率', 'Chance of a hit required')}
          unit="%"
          value={settings.threshold}
          onChange={(threshold) => setHitProbability({ threshold })}
          min={0}
          max={100}
          invalid={thresholdInvalid}
          errorText={t('0 より大きく 100 未満で入力してください。', 'Enter more than 0 and less than 100.')}
        />
      </div>
      {settings.groupMeasure === 'extreme-spread' && groupSigma !== null && !groupInvalid && (
        <p className="text-sm text-on-surface-variant">
          {t(
            `${format(settings.groupShots, 0)} 発の群の平均的な大きさから σ = ${format(groupSigma, 2)} ${angleLabel} と見積もります。1 群だけの値は誤差が大きくなります。`,
            `Taken as the average ${format(settings.groupShots, 0)}-shot group, σ = ${format(groupSigma, 2)} ${angleLabel}. A single group gives a rough figure.`,
          )}
        </p>
      )}
      <ResultFigure
        size="lead"
        label={t('この確率で当たる最大距離', 'Furthest distance at this chance')}
        value={rangeValue}
        note={rangeNote}
      />
      {rows && rows.length > 0 && (
        <div
          role="region"
          aria-label={t('距離ごとの命中確率', 'Hit probability by distance')}
          tabIndex={0}
          className="overflow-x-auto rounded-sm border border-outline-variant"
        >
          <table className="w-full min-w-[26rem] border-collapse text-sm">
            <thead>
              <tr>
                {[
                  [t('距離', 'Distance'), input.distanceUnit],
                  [t('命中確率', 'Chance'), '%'],
                  [t('上下のばらつき', 'Vertical SD'), input.dropUnit],
                  [t('左右のばらつき', 'Horizontal SD'), input.dropUnit],
                  [t('最大の要因', 'Largest part'), ''],
                ].map(([label, unit], index) => (
                  <th
                    key={label}
                    scope="col"
                    className={`bg-surface-container px-2 py-2 align-bottom font-medium ${index === 0 ? 'text-left' : 'text-right'}`}
                  >
                    <span className="block">{label}</span>
                    <span className="block text-xs font-normal text-on-surface-variant">{unit}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) =>
                row === null ? null : (
                  <tr key={index} className="border-t border-outline-variant">
                    <th scope="row" className="px-2 py-2 text-left font-normal tabular-nums">
                      {format(fromMeters(row.distanceMeters, input.distanceUnit), 0)}
                    </th>
                    <td
                      className={`px-2 py-2 text-right tabular-nums ${row.probability * 100 < settings.threshold ? 'text-error' : ''}`}
                    >
                      {format(row.probability * 100, 1)}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {format(fromMetersToDropUnit(row.sigmaVerticalMeters, input.dropUnit), 1)}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {format(fromMetersToDropUnit(row.sigmaHorizontalMeters, input.dropUnit), 1)}
                    </td>
                    <td className="px-2 py-2 text-right">{largest(row)}</td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      )}
      <ul className="space-y-2 text-xs text-on-surface-variant">
        <li>
          {t(
            '距離と風を読んだとおりに狙った場合の確率で、ゼロのずれは含みません。',
            'Assumes the hold matches the distance and wind you judged, with a true zero.',
          )}
        </li>
        <li>
          {t(
            '群・初速・風・距離のばらつきを独立な正規分布とし、左右と上下の標準偏差から円に入る確率を数値積分で求めます。',
            'The group, velocity, wind and distance errors are independent normal spreads; the chance of landing in the circle is integrated from the horizontal and vertical SDs.',
          )}
        </li>
        <li>
          {t(
            '見えない部位・動く獲物・安全を確認できない射撃はしないでください。',
            'Do not shoot at what you cannot see clearly, at a moving animal you cannot track, or without a safe backstop.',
          )}
        </li>
      </ul>
    </>
  );
}
