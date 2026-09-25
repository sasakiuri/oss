'use client';

import { useId, useMemo, useState } from 'react';
import { LuPlus, LuTrash2 } from 'react-icons/lu';

import { NumberField, SegmentedControl } from '@/components/labs';
import { Button } from '@/components/ui';
import { MAX_COMPARED_LOADS, TRAJECTORY_CARD_NAME_MAX, type ComparedLoad } from '@/lib/schemas/trajectory';
import { fromMeters } from '@/lib/sight-adjustment';
import {
  JOULES_PER_FOOT_POUND,
  calculateTrajectory,
  fromMetersToDropUnit,
  type DragModel,
  type TrajectoryInput,
  type TrajectoryResult,
} from '@/lib/trajectory';

import { useTrajectoryStore } from './_store';

type Reading = 'offset' | 'moa' | 'mil';

interface LoadComparisonSectionProps {
  input: TrajectoryInput;
  inputInvalid: boolean;
  /** The load in the form, named as the card names it. */
  mainName: string;
  t: (ja: string, en: string) => string;
  format: (value: number, digits?: number) => string;
}

const loadLetter = (index: number) => String.fromCharCode(65 + index);

const bcInvalid = (value: number) => !Number.isFinite(value) || value < 0.01 || value > 2;
const invalidLoad = (load: ComparedLoad) =>
  !(load.muzzleSpeed > 0) || !(load.mass > 0) || bcInvalid(load.ballisticCoefficient);

function NameField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const id = useId();
  return (
    <div className="min-w-0 space-y-2">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        type="text"
        value={value}
        maxLength={TRAJECTORY_CARD_NAME_MAX}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

/**
 * Two to four loads side by side. Everything but the load itself - the sight, the zero, the air,
 * the wind and the slope - is the form's, so the columns differ only by what was changed.
 */
export function LoadComparisonSection({ input, inputInvalid, mainName, t, format }: LoadComparisonSectionProps) {
  // No compared load is an empty list; an absent field says the same.
  const saved = useTrajectoryStore((state) => state.comparison);
  const comparison = useMemo(() => saved ?? [], [saved]);
  const setComparison = useTrajectoryStore((state) => state.setComparison);
  const [reading, setReading] = useState<Reading>('offset');
  const speedLabel = input.muzzleSpeed.unit === 'mps' ? 'm/s' : 'fps';
  const massLabel = input.mass.unit === 'g' ? 'g' : 'grain';
  const imperial = input.muzzleSpeed.unit === 'fps';

  const update = (index: number, changes: Partial<ComparedLoad>) =>
    setComparison(comparison.map((load, position) => (position === index ? { ...load, ...changes } : load)));
  const add = () =>
    setComparison([
      ...comparison,
      {
        name: '',
        muzzleSpeed: input.muzzleSpeed.value,
        mass: input.mass.value,
        ballisticCoefficient: input.ballisticCoefficient,
        dragModel: input.dragModel,
      },
    ]);

  const results = useMemo<(TrajectoryResult | null)[]>(
    () =>
      inputInvalid || comparison.length === 0
        ? []
        : [
            calculateTrajectory(input),
            ...comparison.map((load) =>
              invalidLoad(load)
                ? null
                : calculateTrajectory({
                    ...input,
                    muzzleSpeed: { value: load.muzzleSpeed, unit: input.muzzleSpeed.unit },
                    mass: { value: load.mass, unit: input.mass.unit },
                    ballisticCoefficient: load.ballisticCoefficient,
                    dragModel: load.dragModel,
                  }),
            ),
          ],
    [input, inputInvalid, comparison],
  );
  const names = [
    mainName || loadLetter(0),
    ...comparison.map((load, index) => load.name.trim() || loadLetter(index + 1)),
  ];
  const distances = results[0]?.rows.map((row) => row.distanceMeters) ?? [];
  const cell = (result: TrajectoryResult | null | undefined, distanceMeters: number, pick: 'drop' | 'energy') => {
    const row = result?.rows.find((candidate) => candidate.distanceMeters === distanceMeters);
    if (!row) return '—';
    if (pick === 'energy') return format(imperial ? row.energyJoules / JOULES_PER_FOOT_POUND : row.energyJoules, 0);
    if (reading === 'moa') return format(row.dropMoa, 1);
    if (reading === 'mil') return format(row.dropMil, 2);
    return format(fromMetersToDropUnit(row.dropMeters, input.dropUnit), 1);
  };
  const dropUnit = reading === 'offset' ? input.dropUnit : reading === 'moa' ? 'MOA' : 'mil';
  const positiveError = t('0 より大きい数値を入力してください。', 'Enter a number greater than zero.');

  return (
    <>
      <p className="text-sm text-on-surface-variant">
        {t(
          `スコープ高・ゼロイン・大気・風・傾斜は ${names[0]} と同じです。`,
          `Sight height, zero, air, wind and slope are the same as for ${names[0]}.`,
        )}
      </p>
      {comparison.map((load, index) => (
        <fieldset key={index} className="min-w-0 space-y-4 rounded-sm border border-outline-variant p-4">
          <legend className="px-1 text-sm font-medium">
            {t(`ロード ${loadLetter(index + 1)}`, `Load ${loadLetter(index + 1)}`)}
          </legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <NameField
              label={t('名前（任意）', 'Name (optional)')}
              value={load.name}
              onChange={(name) => update(index, { name })}
            />
            <NumberField
              label={t('初速', 'Muzzle velocity')}
              unit={speedLabel}
              value={load.muzzleSpeed}
              onChange={(muzzleSpeed) => update(index, { muzzleSpeed })}
              min={0}
              invalid={!(load.muzzleSpeed > 0)}
              errorText={positiveError}
            />
            <NumberField
              label={t('弾頭重量', 'Bullet weight')}
              unit={massLabel}
              value={load.mass}
              onChange={(mass) => update(index, { mass })}
              min={0}
              invalid={!(load.mass > 0)}
              errorText={positiveError}
            />
            <NumberField
              label={t('弾道係数 BC', 'Ballistic coefficient')}
              value={load.ballisticCoefficient}
              onChange={(ballisticCoefficient) => update(index, { ballisticCoefficient })}
              units={{
                value: load.dragModel,
                label: t('抗力モデル', 'Drag function'),
                options: [
                  { value: 'g1', label: 'G1' },
                  { value: 'g7', label: 'G7' },
                ],
                onChange: (dragModel: DragModel) => update(index, { dragModel }),
              }}
              min={0.01}
              max={2}
              invalid={bcInvalid(load.ballisticCoefficient)}
              errorText={t('0.01 から 2 の範囲で入力してください。', 'Enter a coefficient between 0.01 and 2.')}
            />
          </div>
          <Button variant="ghost" onClick={() => setComparison(comparison.filter((_, position) => position !== index))}>
            <LuTrash2 aria-hidden="true" />
            {t(`ロード ${loadLetter(index + 1)} を外す`, `Remove load ${loadLetter(index + 1)}`)}
          </Button>
        </fieldset>
      ))}
      {comparison.length < MAX_COMPARED_LOADS && (
        <Button variant="outline" onClick={add}>
          <LuPlus aria-hidden="true" />
          {t('比べるロードを追加', 'Add a load to compare')}
        </Button>
      )}
      {comparison.length > 0 && results.length > 0 && (
        <div className="space-y-3">
          <SegmentedControl
            legend={t('落差の単位', 'Drop in')}
            orientation="inline"
            value={reading}
            onChange={(value) => setReading(value as Reading)}
            options={[
              { value: 'offset', label: input.dropUnit },
              { value: 'moa', label: 'MOA' },
              { value: 'mil', label: 'mil' },
            ]}
          />
          <div
            role="region"
            aria-label={t('ロードごとの落差とエネルギー', 'Drop and energy by load')}
            tabIndex={0}
            className="overflow-x-auto rounded-sm border border-outline-variant"
          >
            <table className="w-full min-w-[28rem] border-collapse text-sm">
              <thead>
                <tr>
                  <th scope="col" className="bg-surface-container px-2 py-2 text-left align-bottom font-medium">
                    {t('距離', 'Distance')} {input.distanceUnit}
                  </th>
                  {names.map((name, index) => (
                    <th key={index} scope="col" className="bg-surface-container px-2 py-2 text-right font-medium">
                      <span className="block">{name}</span>
                      <span className="block text-xs font-normal text-on-surface-variant">
                        {t(
                          `落差 ${dropUnit}／${imperial ? 'ft-lb' : 'J'}`,
                          `Drop ${dropUnit} / ${imperial ? 'ft-lb' : 'J'}`,
                        )}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {distances.map((distanceMeters) => (
                  <tr key={distanceMeters} className="border-t border-outline-variant">
                    <th scope="row" className="px-2 py-2 text-left font-normal tabular-nums">
                      {format(fromMeters(distanceMeters, input.distanceUnit), 0)}
                    </th>
                    {results.map((result, index) => (
                      <td key={index} className="px-2 py-2 text-right tabular-nums">
                        {`${cell(result, distanceMeters, 'drop')} / ${cell(result, distanceMeters, 'energy')}`}
                      </td>
                    ))}
                  </tr>
                ))}
                <tr className="border-t border-outline-variant">
                  <th scope="row" className="px-2 py-2 text-left font-normal">
                    {t('最大直接照準距離', 'Point blank range')}
                  </th>
                  {results.map((result, index) => (
                    <td key={index} className="px-2 py-2 text-right tabular-nums">
                      {result?.pointBlank
                        ? `${format(fromMeters(result.pointBlank.rangeMeters, input.distanceUnit), 0)} ${input.distanceUnit}`
                        : '—'}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-xs text-on-surface-variant">
            {t(
              '各ロードは同じゼロイン距離で合わせています。「—」は届かない距離か、入力にエラーがあるロードです。',
              'Each load is zeroed at the same distance. A dash is a distance the load does not reach, or a load with an error.',
            )}
          </p>
        </div>
      )}
    </>
  );
}
