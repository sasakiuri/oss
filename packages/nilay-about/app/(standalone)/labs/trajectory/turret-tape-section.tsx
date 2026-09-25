'use client';

import { useMemo } from 'react';
import { LuPrinter } from 'react-icons/lu';

import { NumberField, SelectField } from '@/components/labs';
import { Button } from '@/components/ui';
import { fromMeters, toMeters } from '@/lib/sight-adjustment';
import {
  MAX_TABLE_ROWS,
  offsetInClicks,
  sampleTrajectory,
  type ClickSetting,
  type TrajectoryInput,
} from '@/lib/trajectory';
import { A4_HEIGHT_MM, A4_WIDTH_MM, RULER_LENGTH_MM } from '@/lib/trajectory-card';
import { MAX_TAPE_LENGTH_MM, TAPE_MARGIN_MM, layoutTurretTape, type TurretTapeLayout } from '@/lib/turret-tape';

import { blankTurretTape, useTrajectoryStore } from './_store';

const TAPE_FONT = "'Noto Sans JP', 'Hiragino Sans', 'Yu Gothic', 'Meiryo', sans-serif";
/** Height of the strip: room for the ticks, the click numbers and the distances. */
const TAPE_HEIGHT_MM = 14;

interface TurretTapeSheetProps {
  layout: TurretTapeLayout;
  /** One line under the strip: the load, the zero and the click value it was made for. */
  caption: string;
  note: string;
  turnLabel: (turn: number) => string;
  label?: string;
  actualSize?: boolean;
  className?: string;
}

/** The strip on an A4 sheet, in millimetres, with the 50 mm reference line under it. */
export function TurretTapeSheet({
  layout,
  caption,
  note,
  turnLabel,
  label,
  actualSize = false,
  className,
}: TurretTapeSheetProps) {
  const left = TAPE_MARGIN_MM;
  const top = TAPE_MARGIN_MM;
  const rulerTop = top + TAPE_HEIGHT_MM + 14;
  const tick = (major: boolean) => (major ? 3.2 : 1.8);
  return (
    <svg
      viewBox={`0 0 ${A4_WIDTH_MM} ${actualSize ? A4_HEIGHT_MM : rulerTop + 12}`}
      className={className}
      {...(actualSize
        ? { width: `${A4_WIDTH_MM}mm`, height: `${A4_HEIGHT_MM}mm`, 'aria-hidden': true }
        : { role: 'img', 'aria-label': label })}
    >
      <rect x={0} y={0} width={A4_WIDTH_MM} height={actualSize ? A4_HEIGHT_MM : rulerTop + 12} fill="#ffffff" />
      <rect
        x={left}
        y={top}
        width={layout.lengthMm}
        height={TAPE_HEIGHT_MM}
        fill="none"
        stroke="#000000"
        strokeWidth={0.2}
      />
      {layout.ticks.map((entry) => (
        <g key={entry.clicks}>
          <line
            x1={left + entry.positionMm}
            y1={top}
            x2={left + entry.positionMm}
            y2={top + tick(entry.major)}
            stroke="#000000"
            strokeWidth={entry.major ? 0.25 : 0.12}
          />
          {entry.major && (
            <text
              x={left + entry.positionMm}
              y={top + 5.2}
              fontFamily={TAPE_FONT}
              fontSize={1.8}
              textAnchor="middle"
              fill="#000000"
            >
              {entry.clicks}
            </text>
          )}
        </g>
      ))}
      {layout.marks.map((mark) => (
        <g key={`${mark.distanceLabel}-${mark.clicks}`}>
          <line
            x1={left + mark.positionMm}
            y1={top + 6.5}
            x2={left + mark.positionMm}
            y2={top + TAPE_HEIGHT_MM}
            stroke="#000000"
            strokeWidth={0.35}
          />
          <text
            x={left + mark.positionMm + 0.6}
            y={top + 10}
            fontFamily={TAPE_FONT}
            fontSize={2.6}
            fontWeight="bold"
            fill="#000000"
          >
            {mark.distanceLabel}
          </text>
          {mark.turn > 0 && (
            <text x={left + mark.positionMm + 0.6} y={top + 13} fontFamily={TAPE_FONT} fontSize={1.8} fill="#000000">
              {turnLabel(mark.turn)}
            </text>
          )}
        </g>
      ))}
      <text x={left} y={top + TAPE_HEIGHT_MM + 5} fontFamily={TAPE_FONT} fontSize={2.2} fill="#000000">
        {caption}
      </text>
      <line x1={left} y1={rulerTop} x2={left + RULER_LENGTH_MM} y2={rulerTop} stroke="#000000" strokeWidth={0.3} />
      <line x1={left} y1={rulerTop - 1.5} x2={left} y2={rulerTop + 1.5} stroke="#000000" strokeWidth={0.3} />
      <line
        x1={left + RULER_LENGTH_MM}
        y1={rulerTop - 1.5}
        x2={left + RULER_LENGTH_MM}
        y2={rulerTop + 1.5}
        stroke="#000000"
        strokeWidth={0.3}
      />
      <text x={left} y={rulerTop + 5} fontFamily={TAPE_FONT} fontSize={2.2} fill="#000000">
        {note}
      </text>
    </svg>
  );
}

interface TurretTapeSectionProps {
  input: TrajectoryInput;
  inputInvalid: boolean;
  /** Not chosen yet when undefined; the tape then asks for it. */
  click: ClickSetting | undefined;
  clickLabel: string;
  onPrint: (tape: { layout: TurretTapeLayout; caption: string }) => void;
  t: (ja: string, en: string) => string;
  format: (value: number, digits?: number) => string;
}

/**
 * A tape for the elevation turret: each distance marked where the turret stops for its drop, in
 * the clicks the trajectory above works out. Only distances past the zero, which need clicks up,
 * go on the tape.
 */
export function TurretTapeSection({
  input,
  inputInvalid,
  click,
  clickLabel,
  onPrint,
  t,
  format,
}: TurretTapeSectionProps) {
  const saved = useTrajectoryStore((state) => state.turretTape);
  const entered = saved !== undefined;
  const tape = saved ?? blankTurretTape;
  const setTurretTape = useTrajectoryStore((state) => state.setTurretTape);
  const positive = (value: number) => Number.isFinite(value) && value > 0;
  const circumferenceInvalid = !positive(tape.circumferenceMm);
  const clicksInvalid = !Number.isInteger(tape.clicksPerRevolution) || tape.clicksPerRevolution <= 0;
  const stepInvalid = !positive(tape.step);
  const rangeInvalid = !positive(tape.maxRange);
  const invalid =
    inputInvalid || click === undefined || circumferenceInvalid || clicksInvalid || stepInvalid || rangeInvalid;

  const result = useMemo(() => {
    if (invalid) return null;
    const count = Math.min(Math.floor(tape.maxRange / tape.step + 1e-9), MAX_TABLE_ROWS);
    const distances = Array.from({ length: count }, (_, index) =>
      toMeters(tape.step * (index + 1), input.distanceUnit),
    );
    return distances.length === 0 ? [] : sampleTrajectory(input, distances);
  }, [invalid, input, tape.step, tape.maxRange]);
  const marks = (result ?? [])
    .filter((row) => row !== null)
    .map((row) => ({
      distanceLabel: format(fromMeters(row.distanceMeters, input.distanceUnit), 0),
      clicks: click === undefined ? NaN : Math.round(offsetInClicks(row.dropMeters, row.distanceMeters, click)),
    }))
    .filter((mark) => Number.isFinite(mark.clicks));
  const layout = invalid
    ? null
    : layoutTurretTape({
        circumferenceMm: tape.circumferenceMm,
        clicksPerRevolution: tape.clicksPerRevolution,
        direction: tape.direction,
        marks,
      });
  const caption = t(
    `距離 ${input.distanceUnit}・1 クリック ${clickLabel}・ゼロイン ${format(input.zeroDistance, 0)} ${input.distanceUnit}・初速 ${format(input.muzzleSpeed.value, 1)} ${input.muzzleSpeed.unit === 'mps' ? 'm/s' : 'fps'}・BC ${format(input.ballisticCoefficient, 3)} ${input.dragModel.toUpperCase()}`,
    `Range ${input.distanceUnit} · 1 click ${clickLabel} · zero ${format(input.zeroDistance, 0)} ${input.distanceUnit} · ${format(input.muzzleSpeed.value, 1)} ${input.muzzleSpeed.unit === 'mps' ? 'm/s' : 'fps'} · BC ${format(input.ballisticCoefficient, 3)} ${input.dragModel.toUpperCase()}`,
  );
  const note = t('50 mm の基準線／実際のサイズ（100%）で印刷', '50 mm reference line / print at actual size (100%)');
  const turnLabel = (turn: number) => t(`${turn + 1} 周目`, `turn ${turn + 1}`);
  const positiveError = t('0 より大きい数値を入力してください。', 'Enter a number greater than zero.');
  const overflowMessage =
    layout?.overflow === 'length'
      ? t(
          `A4 に収まるのは長さ ${MAX_TAPE_LENGTH_MM} mm までです。`,
          `A tape on A4 can be at most ${MAX_TAPE_LENGTH_MM} mm long.`,
        )
      : layout?.overflow === 'spacing'
        ? t('目盛りの間隔が狭すぎて印刷できません。', 'The clicks are too close together to print.')
        : null;
  const skipped = marks.length - (layout?.marks.length ?? 0);

  return (
    <>
      {!entered && (
        <p className="rounded-sm bg-surface-container p-4 text-sm">
          {t('未入力です。すべての欄を入力すると計算します。', 'Not entered yet. Fill in every field to work it out.')}
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <NumberField
          fieldId="turret-tape-circumference"
          label={t('ターレットの円周', 'Turret circumference')}
          unit="mm"
          value={tape.circumferenceMm}
          onChange={(circumferenceMm) => setTurretTape({ circumferenceMm })}
          min={0}
          invalid={circumferenceInvalid}
          errorText={positiveError}
          hint={t('紙を 1 周巻いて測るか、直径 × 3.1416', 'Wrap a paper strip once, or diameter × 3.1416')}
        />
        <NumberField
          label={t('1 回転のクリック数', 'Clicks per turn')}
          value={tape.clicksPerRevolution}
          onChange={(clicksPerRevolution) => setTurretTape({ clicksPerRevolution })}
          min={1}
          step={1}
          invalid={clicksInvalid}
          errorText={t('1 以上の整数を入力してください。', 'Enter a whole number of 1 or more.')}
        />
        <NumberField
          label={t('テープの距離の刻み', 'Tape step')}
          unit={input.distanceUnit}
          value={tape.step}
          onChange={(step) => setTurretTape({ step })}
          min={0}
          invalid={stepInvalid}
          errorText={positiveError}
        />
        <NumberField
          label={t('テープの最大距離', 'Tape furthest distance')}
          unit={input.distanceUnit}
          value={tape.maxRange}
          onChange={(maxRange) => setTurretTape({ maxRange })}
          min={0}
          invalid={rangeInvalid}
          errorText={positiveError}
        />
        <SelectField
          label={t('数字の進む向き', 'Numbers run')}
          value={tape.direction}
          onChange={(direction) => setTurretTape({ direction })}
          options={[
            { value: 'left-to-right', label: t('左から右へ', 'Left to right') },
            { value: 'right-to-left', label: t('右から左へ', 'Right to left') },
          ]}
          hint={t(
            'ターレットを正面から見て、上へ回したときに目盛りが進む向き',
            'Facing the turret, the way the marks move as it is turned up',
          )}
        />
      </div>
      <p className="text-sm text-on-surface-variant">
        {t(
          `ゼロイン距離より先の、上へ回す距離だけを印字します。`,
          `Only distances past the zero, dialled up, are printed.`,
        )}
        {skipped > 0 &&
          t(
            ` 手前の ${skipped} 距離は下へ回すため省きました。`,
            ` ${skipped} nearer distances need dialling down and are left off.`,
          )}
      </p>
      {layout === null ? (
        <p className="text-sm text-destructive">
          {click === undefined
            ? t(
                '「弾と銃」でスコープの調整単位を選んでください。',
                'Choose the turret click value under “Load and rifle”.',
              )
            : t('空欄とエラーのある欄を入力してください。', 'Fill in the blank fields and correct any errors.')}
        </p>
      ) : (
        <figure className="space-y-2 rounded-sm bg-surface-container p-4">
          <TurretTapeSheet
            layout={layout}
            caption={caption}
            note={note}
            turnLabel={turnLabel}
            label={t('印刷するテープのプレビュー', 'Tape print preview')}
            className="w-full drop-shadow-sm"
          />
          <figcaption className="text-center text-xs text-on-surface-variant">
            {t(
              `長さ ${format(layout.lengthMm, 1)} mm、1 クリック ${format(layout.clickSpacingMm, 2)} mm`,
              `${format(layout.lengthMm, 1)} mm long, ${format(layout.clickSpacingMm, 2)} mm per click`,
            )}
          </figcaption>
        </figure>
      )}
      {overflowMessage && (
        <p role="alert" className="rounded-sm bg-error-container p-4 text-sm text-on-error-container">
          {overflowMessage}
        </p>
      )}
      <Button
        className="w-full"
        onClick={() => {
          if (layout === null || layout.overflow !== null) {
            document.getElementById('turret-tape-circumference')?.focus();
            return;
          }
          onPrint({ layout, caption });
        }}
      >
        <LuPrinter aria-hidden="true" />
        {t('テープを印刷する', 'Print the tape')}
      </Button>
      <p className="text-xs text-on-surface-variant">
        {t(
          '「実際のサイズ（100%）」で印刷し、基準線が 50 mm あるか確かめてから、0 をターレットのゼロに合わせて巻きます。',
          'Print at actual size (100%), check the reference line measures 50 mm, then wrap the tape with 0 on the turret’s zero.',
        )}
      </p>
    </>
  );
}
