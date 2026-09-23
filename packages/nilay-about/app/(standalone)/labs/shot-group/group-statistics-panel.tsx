'use client';

import {
  COMPARISON_GROUP_SIZES,
  CONFIDENCE_LEVEL,
  PUBLISHED_GROUP_SIZE_LIMIT,
  REQUIRED_SHOTS_LIMIT,
  axisVerdict,
  expectedExtremeSpread,
  groupVerdict,
  requiredShots,
  type AxisEstimate,
  type GroupStatistics,
} from '@/lib/group-statistics';
import type { PrecisionUnit } from '@/lib/schemas/shot-group';
import { toAngularSize } from '@/lib/shot-group';
import { MIL_RADIANS, MOA_RADIANS, angularSizeMm, toMeters, toMillimeters } from '@/lib/sight-adjustment';
import { useLanguage } from '@/store';

import { useShotGroupStore } from './_store';
import { RoundedNumberField } from './fields';
import { createFormatters, UNIT_DIGITS, type Language } from './format';

/** Whether the offset from the aim point is the sight's or chance, shown beside the handoff values. */
export function statisticsHeadline(statistics: GroupStatistics | null, scaleSet: boolean, language: Language): string {
  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);
  const axisName = (axis: 'vertical' | 'horizontal') =>
    axis === 'vertical' ? t('上下', 'vertical') : t('左右', 'horizontal');
  if (statistics === null)
    return !scaleSet
      ? t('実寸の基準を設定すると、補正してよいかを判定します。', 'Set the scale to see whether to correct.')
      : t(
          '着弾を 2 発以上記録すると、補正してよいかを判定します。',
          'Record two or more impacts to see whether to correct.',
        );
  const verdict = groupVerdict(statistics);
  if (verdict === 'no-dispersion')
    return t(
      '着弾がすべて同じ位置のため、判定できません。',
      'All impacts are at the same point, so there is nothing to judge.',
    );
  if (verdict === 'both-axes')
    return t(
      '上下・左右とも、狙点からのズレは偶然では説明できません。両方とも補正できます。',
      'Both offsets from the aim point are beyond chance. You can correct both.',
    );
  if (verdict === 'vertical-only' || verdict === 'horizontal-only') {
    const decided = verdict === 'vertical-only' ? 'vertical' : 'horizontal';
    const other = verdict === 'vertical-only' ? 'horizontal' : 'vertical';
    return t(
      `${axisName(decided)}のズレは偶然では説明できません。補正は${axisName(decided)}だけにして、${axisName(other)}はそのままにしてください。`,
      `The ${axisName(decided)} offset is beyond chance. Correct ${axisName(decided)} only and leave ${axisName(other)} as it is.`,
    );
  }
  return t(
    '上下・左右とも、狙点からのズレは偶然の範囲内です。この群では補正の向きを決められません。',
    'Both offsets from the aim point are within chance. This group cannot set a correction.',
  );
}

/** A blank target is a question not asked; zero or a minus sign is a mistake to point out. */
export const targetPrecisionInvalid = (value: number | null) => value !== null && !(value > 0);

/** The confidence intervals, the shots needed and the group size estimates behind `statisticsHeadline`. */
export function GroupStatisticsPanel({
  statistics,
}: {
  /** Null until two impacts have been measured, which is where the statistics begin. */
  statistics: GroupStatistics | null;
}) {
  const { offsetUnit, distance, targetPrecision, setTargetPrecision, setTargetPrecisionUnit } = useShotGroupStore();
  const language = useLanguage();
  const { t, format, length, vertical, horizontal } = createFormatters(language, offsetUnit);
  const percent = format(CONFIDENCE_LEVEL * 100, 0);

  const distanceMeters = toMeters(distance.value, distance.unit);
  const distanceUsable = Number.isFinite(distanceMeters) && distanceMeters > 0;
  const { value: targetValue, unit: targetUnit } = targetPrecision;
  const targetInvalid = targetPrecisionInvalid(targetValue);

  // An angle needs the distance to become a length, so it can be null while a length never is.
  const targetMm =
    targetValue === null || !(targetValue > 0)
      ? null
      : targetUnit === 'moa' || targetUnit === 'mil'
        ? distanceUsable
          ? angularSizeMm((targetUnit === 'moa' ? MOA_RADIANS : MIL_RADIANS) * targetValue, distanceMeters)
          : null
        : toMillimeters(targetValue, targetUnit);
  const targetAngle = targetMm === null || !distanceUsable ? null : toAngularSize(targetMm, distanceMeters);

  // Both axes must reach the target, so the larger count wins. Null means the limit was hit.
  const shotsNeeded = (() => {
    if (statistics === null || targetMm === null) return null;
    const horizontalShots = requiredShots(statistics.horizontal.sdMm, targetMm);
    const verticalShots = requiredShots(statistics.vertical.sdMm, targetMm);
    if (horizontalShots === null || verticalShots === null) return 'over-limit' as const;
    return Math.max(horizontalShots, verticalShots);
  })();

  const verdictText = (axis: AxisEstimate) =>
    ({
      decided: t('偶然では説明できない', 'Not explained by chance'),
      chance: t('偶然の範囲', 'Within chance'),
      'no-dispersion': t('ばらつき 0 で判定不可', 'No dispersion to judge'),
    })[axisVerdict(axis)];

  const intervalText = (axis: AxisEstimate, direction: (millimetres: number) => string) =>
    axis.degenerate ? '—' : `${direction(axis.lowMm)} 〜 ${direction(axis.highMm)}`;

  const requiredText = () => {
    if (statistics === null) return t('着弾が 2 発以上必要です。', 'Needs two or more impacts.');
    if (targetValue === null || !(targetValue > 0))
      return t('目標の精度を入力してください。', 'Enter the target precision.');
    if (targetMm === null)
      return t('角度で指定するときは射距離を入力してください。', 'Enter the distance to use an angle.');
    if (shotsNeeded === 'over-limit')
      return t(
        `このばらつきでは ${format(REQUIRED_SHOTS_LIMIT, 0)} 発撃っても ±${length(targetMm)} に届きません。目標を広げるか、ばらつきを小さくしてください。`,
        `At this dispersion even ${format(REQUIRED_SHOTS_LIMIT, 0)} shots will not reach ±${length(targetMm)}. Widen the target or tighten the group.`,
      );
    // Unreachable (both null cases are handled above); narrows the type.
    if (shotsNeeded === null) return '';
    const more = shotsNeeded - statistics.count;
    return t(
      `平均着弾点を ±${length(targetMm)} で決めるには合計 ${format(shotsNeeded, 0)} 発必要です。${
        more > 0 ? `あと ${format(more, 0)} 発です。` : 'すでに足りています。'
      }`,
      `±${length(targetMm)} on the mean point of impact takes ${format(shotsNeeded, 0)} shots in all. ${
        more > 0 ? `${format(more, 0)} more to go.` : 'You already have enough.'
      }`,
    );
  };

  const nextGroup =
    statistics !== null && statistics.count <= PUBLISHED_GROUP_SIZE_LIMIT
      ? expectedExtremeSpread(statistics.sigmaMm, statistics.count)
      : null;

  return (
    <div className="space-y-5">
      <p className="text-sm text-on-surface-variant">
        {t(
          `軸ごとに、狙点からのズレが照準によるものか偶然かを ${percent}% 信頼区間で判定します。`,
          `For each axis, whether the offset from the aim point is the sight's or chance, at ${percent}% confidence.`,
        )}
      </p>

      {statistics !== null && (
        <table className="w-full text-sm">
          <caption className="sr-only">
            {t('平均着弾点の信頼区間と軸ごとの判定', 'Confidence interval on the mean point of impact, by axis')}
          </caption>
          <thead>
            <tr>
              <th scope="col" className="py-2 text-left font-medium">
                {t('軸', 'Axis')}
              </th>
              <th scope="col" className="py-2 text-right font-medium">
                {t('平均のズレ', 'Mean offset')}
              </th>
              <th scope="col" className="py-2 text-right font-medium">
                {t(`${percent}% 信頼区間`, `${percent}% interval`)}
              </th>
              <th scope="col" className="py-2 text-right font-medium">
                {t('判定', 'Verdict')}
              </th>
            </tr>
          </thead>
          <tbody>
            {(
              [
                ['vertical', t('上下', 'Vertical'), statistics.vertical, vertical],
                ['horizontal', t('左右', 'Horizontal'), statistics.horizontal, horizontal],
              ] as const
            ).map(([key, label, axis, direction]) => (
              <tr key={key} className="border-t border-outline-variant align-top">
                <th scope="row" className="py-2 text-left font-normal">
                  {label}
                </th>
                <td className="py-2 text-right tabular-nums">{direction(axis.meanMm)}</td>
                <td className="py-2 text-right tabular-nums">{intervalText(axis, direction)}</td>
                <td className="py-2 text-right">{verdictText(axis)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="space-y-4 border-t border-outline-variant pt-5">
        <h3 className="text-base font-medium">{t('必要な発数', 'Shots needed')}</h3>
        <RoundedNumberField<PrecisionUnit>
          className="sm:max-w-sm"
          label={t('平均着弾点を決めたい精度（±）', 'Target precision on the mean point of impact (±)')}
          value={targetValue}
          digits={targetUnit === 'moa' || targetUnit === 'mil' ? 2 : UNIT_DIGITS[targetUnit]}
          onChange={setTargetPrecision}
          min={0}
          units={{
            value: targetUnit,
            label: t('目標の単位', 'Target unit'),
            options: [
              { value: 'mm', label: 'mm' },
              { value: 'cm', label: 'cm' },
              { value: 'inch', label: 'inch' },
              { value: 'moa', label: 'MOA' },
              { value: 'mil', label: 'mil' },
            ],
            // A goal, not a measured length: the number is kept in the new unit.
            onChange: setTargetPrecisionUnit,
          }}
          hint={
            targetAngle === null
              ? t(
                  '単位を変えても数値は変わりません（5 mm → 5 MOA）。',
                  'Changing the unit keeps the number (5 mm → 5 MOA).',
                )
              : t(
                  `この射距離では ±${length(targetMm)}、${format(targetAngle.moa, 2)} MOA、${format(targetAngle.mil, 2)} mil です。`,
                  `At this distance: ±${length(targetMm)}, ${format(targetAngle.moa, 2)} MOA, ${format(targetAngle.mil, 2)} mil.`,
                )
          }
          invalid={targetInvalid}
          errorText={t('0 より大きい数値を入力してください。', 'Enter a number greater than zero.')}
        />
        <p className="text-sm">{requiredText()}</p>
        <p className="text-xs text-on-surface-variant">
          {t(
            '今のばらつきが続くと仮定した発数です。ばらつきも少ない発数からの推定なので、撃ち進めると変わります。',
            'Assumes the dispersion so far holds. That dispersion is itself an estimate, so the count changes as you shoot more.',
          )}
        </p>
      </div>

      {statistics !== null && (
        <div className="space-y-4 border-t border-outline-variant pt-5">
          <h3 className="text-base font-medium">{t('群の大きさの推定', 'Group size estimates')}</h3>
          <dl className="space-y-3 text-sm">
            <div className="flex flex-wrap justify-between gap-2">
              <dt>{t('1 発のばらつき（σ）', 'Per-shot dispersion (σ)')}</dt>
              <dd className="tabular-nums">
                {t(
                  `${length(statistics.sigmaMm)}（${percent}% 区間 ${length(statistics.sigmaLowMm)} 〜 ${length(statistics.sigmaHighMm)}）`,
                  `${length(statistics.sigmaMm)} (${percent}% interval ${length(statistics.sigmaLowMm)} to ${length(statistics.sigmaHighMm)})`,
                )}
              </dd>
            </div>
            <div className="flex flex-wrap justify-between gap-2">
              <dt>{t('多数発での平均半径', 'Mean radius over many shots')}</dt>
              <dd className="tabular-nums">
                {t(
                  `${length(statistics.meanRadiusMm)}（${percent}% 区間 ${length(statistics.meanRadiusLowMm)} 〜 ${length(statistics.meanRadiusHighMm)}）`,
                  `${length(statistics.meanRadiusMm)} (${percent}% interval ${length(statistics.meanRadiusLowMm)} to ${length(statistics.meanRadiusHighMm)})`,
                )}
              </dd>
            </div>
            <div className="flex flex-wrap justify-between gap-2">
              <dt>
                {t(
                  `次に ${format(statistics.count, 0)} 発撃ったときの最大中心間距離`,
                  `Extreme spread of the next ${format(statistics.count, 0)} shots`,
                )}
              </dt>
              <dd className="tabular-nums">
                {nextGroup === null
                  ? t(
                      `${format(PUBLISHED_GROUP_SIZE_LIMIT, 0)} 発を超えると表示しません。`,
                      `Not shown above ${format(PUBLISHED_GROUP_SIZE_LIMIT, 0)} shots.`,
                    )
                  : t(
                      `半数は ${length(nextGroup.p25Mm)} 〜 ${length(nextGroup.p75Mm)}、20 回に 19 回は ${length(nextGroup.p025Mm)} 〜 ${length(nextGroup.p975Mm)}`,
                      `Half between ${length(nextGroup.p25Mm)} and ${length(nextGroup.p75Mm)}; 19 in 20 between ${length(nextGroup.p025Mm)} and ${length(nextGroup.p975Mm)}`,
                    )}
              </dd>
            </div>
            <div className="flex flex-wrap justify-between gap-2">
              <dt>{t('同じばらつきでの平均（発数別）', 'Average by group size, same dispersion')}</dt>
              <dd className="tabular-nums">
                {COMPARISON_GROUP_SIZES.map((size) => {
                  const expectation = expectedExtremeSpread(statistics.sigmaMm, size);
                  return t(
                    `${format(size, 0)} 発 ${length(expectation?.meanMm ?? null)}`,
                    `${format(size, 0)} shots ${length(expectation?.meanMm ?? null)}`,
                  );
                }).join(' / ')}
              </dd>
            </div>
          </dl>
          <p className="text-xs text-on-surface-variant">
            {t(
              '同じ銃でも 3 発の群は 10 発の群より小さく出るため、発数のちがう群は比べられません。',
              'The same rifle prints smaller three-shot groups than ten-shot groups, so groups of different sizes cannot be compared.',
            )}
          </p>
          {statistics.circularModelDoubtful && (
            <p className="rounded-sm bg-error-container p-4 text-sm text-on-error-container">
              {t(
                `縦と横のばらつきの差が大きく（${format(statistics.axisRatio, 1)} 倍）、この節の前提（縦横が同じばらつき）から外れています。σ・平均半径・最大中心間距離の予測は目安です。判定と必要発数はこの前提を使わないため、影響を受けません。`,
                `The group is far from round (one axis scatters ${format(statistics.axisRatio, 1)} times the other), outside the equal-scatter model this section assumes. Treat σ, the mean radius and the predicted extreme spread as rough. The verdicts and the shot count do not use this model.`,
              )}
            </p>
          )}
        </div>
      )}

      <p className="text-xs text-on-surface-variant">
        {t(
          '区間は t 分布（平均着弾点）と χ² 分布（ばらつき）から求めます。σ の推定、平均半径の式、発数ごとの最大中心間距離の分布は Ballistipedia「Closed Form Precision」「Range Statistics」（2026-09-22 取得）によります。',
          'Intervals: t distribution for the mean point of impact, χ² for the dispersion. The σ estimate, the mean radius and the extreme spread distribution by group size follow Ballistipedia, "Closed Form Precision" and "Range Statistics" (retrieved 2026-09-22).',
        )}
      </p>
    </div>
  );
}
