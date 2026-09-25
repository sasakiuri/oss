'use client';

import { useMemo } from 'react';

import { NumberField, SelectField } from '@/components/labs';
import { RETICLE_SCALE, holdOnScale, reticleHold, type FocalPlane, type ReticleUnit } from '@/lib/reticle-hold';
import { toMeters } from '@/lib/sight-adjustment';
import { sampleTrajectory, type TrajectoryInput } from '@/lib/trajectory';

import { blankReticle, useTrajectoryStore } from './_store';

interface ReticleHoldSectionProps {
  input: TrajectoryInput;
  inputInvalid: boolean;
  t: (ja: string, en: string) => string;
  format: (value: number, digits?: number) => string;
}

/** The reticle drawn in its own marks: one unit of the scale is one unit of the drawing. */
function ReticleDrawing({
  unit,
  up,
  right,
  onScale,
  label,
}: {
  unit: ReticleUnit;
  up: number;
  right: number;
  onScale: boolean;
  label: string;
}) {
  const { reach, minor, major, label: labelEvery } = RETICLE_SCALE[unit];
  const edge = reach * 1.12;
  const ticks: { at: number; kind: 'minor' | 'major' | 'label' }[] = [];
  for (let step = 1; step * minor <= reach + 1e-9; step += 1) {
    const at = step * minor;
    const onMajor = Math.abs(at / major - Math.round(at / major)) < 1e-9;
    const onLabel = Math.abs(at / labelEvery - Math.round(at / labelEvery)) < 1e-9;
    ticks.push({ at, kind: onLabel ? 'label' : onMajor ? 'major' : 'minor' });
  }
  const length = (kind: 'minor' | 'major' | 'label') =>
    (kind === 'minor' ? 0.25 : kind === 'major' ? 0.45 : 0.7) * (reach / 10);
  const stroke = reach / 180;
  const font = reach / 16;
  // Held off the scale, the point is drawn on the edge in the direction it lies.
  const scale = onScale ? 1 : reach / Math.max(Math.abs(up), Math.abs(right));
  const x = right * scale;
  const y = -up * scale;
  return (
    <svg
      viewBox={`${-edge} ${-edge} ${2 * edge} ${2 * edge}`}
      role="img"
      aria-label={label}
      className="mx-auto w-full max-w-sm"
    >
      <circle
        cx={0}
        cy={0}
        r={edge * 0.98}
        fill="var(--md-sys-color-surface)"
        stroke="currentColor"
        strokeWidth={stroke}
      />
      <line x1={-reach} y1={0} x2={reach} y2={0} stroke="currentColor" strokeWidth={stroke} />
      <line x1={0} y1={-reach} x2={0} y2={reach} stroke="currentColor" strokeWidth={stroke} />
      {ticks.flatMap(({ at, kind }) =>
        [-1, 1].map((side) => (
          <g key={`${kind}-${at}-${side}`}>
            <line
              x1={side * at}
              y1={-length(kind)}
              x2={side * at}
              y2={length(kind)}
              stroke="currentColor"
              strokeWidth={stroke}
            />
            <line
              x1={-length(kind)}
              y1={side * at}
              x2={length(kind)}
              y2={side * at}
              stroke="currentColor"
              strokeWidth={stroke}
            />
            {kind === 'label' && side === 1 && (
              <>
                <text x={length(kind) * 1.4} y={at} fontSize={font} dominantBaseline="central" fill="currentColor">
                  {at}
                </text>
                <text x={at} y={-length(kind) * 1.6} fontSize={font} textAnchor="middle" fill="currentColor">
                  {at}
                </text>
              </>
            )}
          </g>
        )),
      )}
      <circle
        cx={x}
        cy={y}
        r={reach / 25}
        fill={onScale ? 'var(--md-sys-color-error)' : 'none'}
        stroke="var(--md-sys-color-error)"
        strokeWidth={stroke * 2}
      />
    </svg>
  );
}

/**
 * Where to hold on a plain reticle for one distance, from the trajectory above. The drop and the
 * drift are those of the table: the day's wind, slope and velocity, with the rifle's own zero.
 */
export function ReticleHoldSection({ input, inputInvalid, t, format }: ReticleHoldSectionProps) {
  const saved = useTrajectoryStore((state) => state.reticle);
  const entered = saved !== undefined;
  const reticle = saved ?? blankReticle;
  const setReticle = useTrajectoryStore((state) => state.setReticle);
  const positive = (value: number) => Number.isFinite(value) && value > 0;
  const distanceInvalid = !positive(reticle.distance);
  const calibrated = reticle.calibratedMagnification ?? NaN;
  const current = reticle.magnification ?? NaN;
  const calibratedInvalid = reticle.focalPlane === 'sfp' && !positive(calibrated);
  const magnificationInvalid = reticle.focalPlane === 'sfp' && !positive(current);
  const row = useMemo(
    () =>
      inputInvalid || distanceInvalid
        ? null
        : (sampleTrajectory(input, [toMeters(reticle.distance, input.distanceUnit)])?.[0] ?? null),
    [input, inputInvalid, distanceInvalid, reticle.distance],
  );
  const hold =
    row && !calibratedInvalid && !magnificationInvalid
      ? reticleHold({
          dropRadians: Math.atan(row.dropMeters / row.distanceMeters),
          driftRadians: Math.atan(row.driftMeters / row.distanceMeters),
          unit: reticle.unit,
          focalPlane: reticle.focalPlane,
          // A first focal plane reticle reads the same at every power, so the magnifications do not enter.
          calibratedMagnification: reticle.focalPlane === 'sfp' ? calibrated : 1,
          magnification: reticle.focalPlane === 'sfp' ? current : 1,
        })
      : null;
  const unitLabel = reticle.unit === 'mil' ? 'mil' : 'MOA';
  const positiveError = t('0 より大きい数値を入力してください。', 'Enter a number greater than zero.');
  const onScale = hold ? holdOnScale(hold, reticle.unit) : true;
  const vertical = hold
    ? hold.up >= 0
      ? t(`上に ${format(hold.up, 2)}`, `${format(hold.up, 2)} up`)
      : t(`下に ${format(-hold.up, 2)}`, `${format(-hold.up, 2)} down`)
    : '—';
  const horizontal = hold
    ? hold.right >= 0
      ? t(`右に ${format(hold.right, 2)}`, `${format(hold.right, 2)} right`)
      : t(`左に ${format(-hold.right, 2)}`, `${format(-hold.right, 2)} left`)
    : '—';
  const summary = hold
    ? t(
        `${format(reticle.distance, 0)} ${input.distanceUnit} では目盛りの${vertical}・${horizontal}（${unitLabel}）を狙います。`,
        `At ${format(reticle.distance, 0)} ${input.distanceUnit}, hold ${vertical} and ${horizontal} ${unitLabel} on the scale.`,
      )
    : t(
        'この距離まで弾が届かないか、入力にエラーがあります。',
        'The bullet does not reach this distance, or a field has an error.',
      );

  return (
    <>
      {!entered && (
        <p className="rounded-sm bg-surface-container p-4 text-sm">
          {t('未入力です。すべての欄を入力すると計算します。', 'Not entered yet. Fill in every field to work it out.')}
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <NumberField
          label={t('狙う距離', 'Distance to hold for')}
          unit={input.distanceUnit}
          value={reticle.distance}
          onChange={(distance) => setReticle({ distance })}
          min={0}
          invalid={distanceInvalid}
          errorText={positiveError}
        />
        <SelectField
          label={t('目盛りの単位', 'Reticle unit')}
          value={reticle.unit}
          onChange={(value) => setReticle({ unit: value as ReticleUnit })}
          options={[
            { value: 'mil', label: 'mil' },
            { value: 'moa', label: 'MOA' },
          ]}
        />
        <SelectField
          label={t('レティクルの位置', 'Focal plane')}
          value={reticle.focalPlane}
          onChange={(value) => setReticle({ focalPlane: value as FocalPlane })}
          options={[
            { value: 'ffp', label: t('第一焦点面（FFP）', 'First focal plane (FFP)') },
            { value: 'sfp', label: t('第二焦点面（SFP）', 'Second focal plane (SFP)') },
          ]}
          hint={t(
            'SFP の目盛りは、メーカーが決めた倍率でだけ表示どおりの角度です。',
            'An SFP reticle reads true only at the magnification its maker calibrated it for.',
          )}
        />
        {reticle.focalPlane === 'sfp' && (
          <>
            <NumberField
              label={t('目盛りが正しい倍率', 'Calibrated magnification')}
              unit="×"
              value={calibrated}
              onChange={(value) => setReticle({ calibratedMagnification: Number.isNaN(value) ? undefined : value })}
              min={0}
              invalid={calibratedInvalid}
              errorText={positiveError}
              hint={t('スコープの説明書に記載', 'From the scope’s manual')}
            />
            <NumberField
              label={t('いまの倍率', 'Current magnification')}
              unit="×"
              value={current}
              onChange={(value) => setReticle({ magnification: Number.isNaN(value) ? undefined : value })}
              min={0}
              invalid={magnificationInvalid}
              errorText={positiveError}
            />
          </>
        )}
      </div>
      <figure className="space-y-2 rounded-sm bg-surface-container p-4">
        {hold && (
          <ReticleDrawing
            unit={reticle.unit}
            up={hold.up}
            right={hold.right}
            onScale={onScale}
            label={t('狙い位置を描いたレティクル', 'Reticle with the hold point')}
          />
        )}
        <figcaption className="text-center text-sm" role="status">
          {summary}
        </figcaption>
      </figure>
      {hold && !onScale && (
        <p role="alert" className="rounded-sm bg-error-container p-4 text-sm text-on-error-container">
          {t(
            `狙い位置が目盛りの範囲（±${RETICLE_SCALE[reticle.unit].reach} ${unitLabel}）の外なので、縁に向きだけ示しています。ダイヤルで修正してください。`,
            `The hold is off the ±${RETICLE_SCALE[reticle.unit].reach} ${unitLabel} scale, so its direction is shown on the edge. Dial it instead.`,
          )}
        </p>
      )}
      {hold && reticle.focalPlane === 'sfp' && hold.markValue !== 1 && (
        <p className="text-sm text-on-surface-variant">
          {t(
            `この倍率では 1 目盛り = ${format(hold.markValue, 2)} ${unitLabel}。狙い位置は目盛りの数で示します。`,
            `At this magnification one mark is ${format(hold.markValue, 2)} ${unitLabel}. The hold is given in marks.`,
          )}
        </p>
      )}
      <p className="text-xs text-on-surface-variant">
        {t(
          '目盛りは mil が 0.5 刻み、MOA が 1 刻みの汎用のものです。風・傾斜・初速は上の表と同じです。',
          'A plain scale: mil in halves, MOA in ones. Wind, slope and velocity are the same as in the table.',
        )}
      </p>
    </>
  );
}
