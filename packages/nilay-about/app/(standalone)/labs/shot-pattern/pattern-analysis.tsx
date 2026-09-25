'use client';

import { memo, useMemo, useState } from 'react';

import { NumberField, SelectField } from '@/components/labs';
import {
  GAP_STEP_CM,
  chokePlan,
  densityGrid,
  gapAnalysis,
  summarisePattern,
  type DensityGrid,
  type GapAnalysis,
  type PatternRecord,
  type ShotOffset,
} from '@/lib/shot-pattern';

type Language = 'ja' | 'en';

const CELL_SIZES = ['2.5', '5', '10'] as const;
const MAP_SIZE = 240;

interface Analysis {
  cellCm: number;
  gapDiameterCm: number;
}

function analyse(shots: readonly ShotOffset[], diameterCm: number, { cellCm, gapDiameterCm }: Analysis) {
  return {
    grid: densityGrid(shots, diameterCm, cellCm),
    gaps: gapAnalysis(shots, diameterCm, gapDiameterCm),
  };
}

/**
 * The pattern circle with the shot count of each cell as depth of one colour, the places a disc of the
 * gap diameter would be empty marked with dots, and the largest empty circle outlined.
 */
function DensityMap({
  diameterCm,
  grid,
  gaps,
  label,
}: {
  diameterCm: number;
  grid: DensityGrid;
  gaps: GapAnalysis | null;
  label: string;
}) {
  const radius = diameterCm / 2;
  const scale = (MAP_SIZE / 2 - 4) / (radius + grid.cellCm / 2);
  const x = (cm: number) => MAP_SIZE / 2 + cm * scale;
  const y = (cm: number) => MAP_SIZE / 2 - cm * scale;
  const clip = `circle-${Math.round(diameterCm * 100)}-${Math.round(grid.cellCm * 100)}`;
  return (
    <svg viewBox={`0 0 ${MAP_SIZE} ${MAP_SIZE}`} role="img" aria-label={label} className="h-auto w-full max-w-xs">
      <defs>
        <clipPath id={clip}>
          <circle cx={MAP_SIZE / 2} cy={MAP_SIZE / 2} r={radius * scale} />
        </clipPath>
      </defs>
      <circle cx={MAP_SIZE / 2} cy={MAP_SIZE / 2} r={radius * scale} className="fill-surface-container-low" />
      <g clipPath={`url(#${clip})`}>
        {grid.cells.map((cell) => (
          <rect
            key={`${cell.x},${cell.y}`}
            x={x(cell.x - grid.cellCm / 2)}
            y={y(cell.y + grid.cellCm / 2)}
            width={grid.cellCm * scale}
            height={grid.cellCm * scale}
            className="fill-primary stroke-surface"
            strokeWidth={1}
            fillOpacity={grid.max > 0 ? cell.count / grid.max : 0}
          >
            <title>{String(cell.count)}</title>
          </rect>
        ))}
        {/* One path for every empty place: thousands of separate dots would slow each render. */}
        {gaps && gaps.gaps.length > 0 && (
          <path
            d={gaps.gaps.map((gap) => `M${x(gap.x) - 1},${y(gap.y) - 1}h2v2h-2z`).join('')}
            className="fill-error"
          />
        )}
      </g>
      <circle
        cx={MAP_SIZE / 2}
        cy={MAP_SIZE / 2}
        r={radius * scale}
        fill="none"
        className="stroke-on-surface"
        strokeWidth={1.5}
      />
      {gaps?.largest && gaps.largest.diameterCm > 0 && (
        <circle
          cx={x(gaps.largest.x)}
          cy={y(gaps.largest.y)}
          r={(gaps.largest.diameterCm / 2) * scale}
          fill="none"
          className="stroke-error"
          strokeWidth={2}
          strokeDasharray="4 3"
        />
      )}
    </svg>
  );
}

function AnalysisControls({
  language,
  analysis,
  onChange,
}: {
  language: Language;
  analysis: Analysis;
  onChange: (analysis: Analysis) => void;
}) {
  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);
  return (
    <div className="grid grid-cols-2 items-start gap-4">
      <SelectField
        label={t('密度のマスの大きさ', 'Density cell size')}
        value={String(analysis.cellCm) as (typeof CELL_SIZES)[number]}
        options={CELL_SIZES.map((size) => ({ value: size, label: `${size} cm` }))}
        onChange={(value) => onChange({ ...analysis, cellCm: Number(value) })}
      />
      <NumberField
        label={t('すき間を調べる円の直径', 'Gap test diameter')}
        unit="cm"
        value={analysis.gapDiameterCm}
        min={0}
        step={0.5}
        onChange={(gapDiameterCm) => onChange({ ...analysis, gapDiameterCm })}
        invalid={!(analysis.gapDiameterCm > 0)}
        errorText={t('0 より大きい数値を入力してください。', 'Enter a number greater than zero.')}
        hint={t(
          '狙う獲物の急所やクレーの大きさなど、調べたい的の大きさ。',
          'The size of the target you care about, such as a clay or a vital area.',
        )}
      />
    </div>
  );
}

function RecordMap({ record, analysis, label }: { record: PatternRecord; analysis: Analysis; label: string }) {
  const { grid, gaps } = useMemo(() => analyse(record.shots, record.diameterCm, analysis), [record, analysis]);
  return grid ? <DensityMap diameterCm={record.diameterCm} grid={grid} gaps={gaps} label={label} /> : null;
}

const DEFAULT_ANALYSIS: Analysis = { cellCm: 5, gapDiameterCm: 10 };

/** The density map and the gaps of the measurement on screen, redrawn only when they change. */
export const PatternAnalysis = memo(function PatternAnalysis({
  shots,
  diameterCm,
  language,
}: {
  shots: readonly ShotOffset[];
  diameterCm: number;
  language: Language;
}) {
  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);
  const [analysis, setAnalysis] = useState(DEFAULT_ANALYSIS);
  const { grid, gaps } = useMemo(() => analyse(shots, diameterCm, analysis), [shots, diameterCm, analysis]);
  const percent = new Intl.NumberFormat(language, { style: 'percent', maximumFractionDigits: 0 });
  const number = new Intl.NumberFormat(language, { maximumFractionDigits: 1 });
  const summary =
    grid && gaps
      ? t(
          `空のマス ${grid.emptyCells} / ${grid.cellsInCircle}。直径 ${number.format(gaps.gapDiameterCm)} cm の的が粒に当たらない位置は円内の ${percent.format(gaps.gapShare)}。最大のすき間は直径 ${number.format(gaps.largest?.diameterCm ?? 0)} cm。`,
          `${grid.emptyCells} of ${grid.cellsInCircle} cells empty. A ${number.format(gaps.gapDiameterCm)} cm target is missed by every pellet at ${percent.format(gaps.gapShare)} of the places it could sit in the circle. Largest gap ${number.format(gaps.largest?.diameterCm ?? 0)} cm across.`,
        )
      : t('円の直径とすき間の直径を入れると表示します。', 'Enter the circle and gap diameters to see this.');
  return (
    <div className="space-y-4">
      <AnalysisControls language={language} analysis={analysis} onChange={setAnalysis} />
      <p className="text-sm">{summary}</p>
      {grid && (
        <DensityMap
          diameterCm={diameterCm}
          grid={grid}
          gaps={gaps}
          label={t(`密度マップ。${summary}`, `Density map. ${summary}`)}
        />
      )}
      <p className="text-xs text-on-surface-variant">
        {t(
          `色の濃さはマスごとの着弾数（最も多いマスで最も濃い）。赤い点は、その位置に置いた直径 ${number.format(analysis.gapDiameterCm)} cm の円に着弾が 1 つもない位置（円内を ${GAP_STEP_CM} cm おきに調べた位置のうち）、破線は円内で最も大きいすき間です。マスの大きさを変えると数も変わるため、比べるときは同じ大きさにしてください。`,
          `Shading is the shots in each cell (darkest in the fullest). Red dots are the places, checked every ${GAP_STEP_CM} cm across the circle, where a ${number.format(analysis.gapDiameterCm)} cm disc would hold no shot; the dashed circle is the largest gap in the circle. Counts change with the cell size, so compare maps at one size.`,
        )}
      </p>
    </div>
  );
});

/** Up to four saved measurements side by side. */
export const MAX_COMPARED = 4;

export function PatternComparison({ records, language }: { records: readonly PatternRecord[]; language: Language }) {
  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);
  const [selected, setSelected] = useState<string[]>([]);
  const [analysis, setAnalysis] = useState(DEFAULT_ANALYSIS);
  const percent = new Intl.NumberFormat(language, { style: 'percent', maximumFractionDigits: 1 });
  const number = new Intl.NumberFormat(language, { maximumFractionDigits: 1 });
  const chosen = records.filter((record) => selected.includes(record.id));
  if (records.length < 2)
    return (
      <p className="text-sm text-on-surface-variant">
        {t('2 件以上保存すると比べられます。', 'Save two or more measurements to compare them.')}
      </p>
    );
  return (
    <div className="space-y-4">
      <fieldset className="space-y-1">
        <legend className="text-sm font-medium">
          {t(`比べる記録（${MAX_COMPARED} 件まで）`, `Measurements to compare (up to ${MAX_COMPARED})`)}
        </legend>
        {records.map((record) => {
          const checked = selected.includes(record.id);
          return (
            <label key={record.id} className="flex min-h-12 cursor-pointer items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={checked}
                disabled={!checked && selected.length >= MAX_COMPARED}
                onChange={(event) =>
                  setSelected(
                    event.target.checked ? [...selected, record.id] : selected.filter((id) => id !== record.id),
                  )
                }
              />
              {record.name}
            </label>
          );
        })}
      </fieldset>
      <AnalysisControls language={language} analysis={analysis} onChange={setAnalysis} />
      {chosen.length > 0 && (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">{t('記録の比較', 'Comparison of measurements')}</caption>
              <thead>
                <tr>
                  <th scope="col" className="py-2 text-left font-medium">
                    {t('記録', 'Measurement')}
                  </th>
                  <th scope="col" className="py-2 text-right font-medium">
                    {t('距離', 'Distance')}
                  </th>
                  <th scope="col" className="py-2 text-right font-medium">
                    {t('パターン率', 'Pattern')}
                  </th>
                  <th scope="col" className="py-2 text-right font-medium">
                    {t('円内', 'Inside')}
                  </th>
                  <th scope="col" className="py-2 text-right font-medium">
                    {t('重心のずれ', 'Centre offset')}
                  </th>
                  <th scope="col" className="py-2 text-right font-medium">
                    {t('内円の割合', 'Inner share')}
                  </th>
                  <th scope="col" className="py-2 text-right font-medium">
                    {t('すき間', 'Gap share')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {chosen.map((record) => {
                  const summary = summarisePattern(record.shots, {
                    diameterCm: record.diameterCm,
                    pellets: record.pellets,
                  });
                  const gaps = gapAnalysis(record.shots, record.diameterCm, analysis.gapDiameterCm);
                  return (
                    <tr key={record.id} className="border-t border-outline-variant">
                      <th scope="row" className="py-2 text-left font-normal">
                        {record.name}
                        {record.setup && <span className="block text-xs text-on-surface-variant">{record.setup}</span>}
                      </th>
                      <td className="py-2 text-right tabular-nums">
                        {record.distanceM === undefined ? '—' : `${number.format(record.distanceM)} m`}
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {summary.patternPercentage === null ? '—' : percent.format(summary.patternPercentage / 100)}
                      </td>
                      <td className="py-2 text-right tabular-nums">{summary.inside}</td>
                      <td className="py-2 text-right tabular-nums">
                        {summary.centroid === null ? '—' : `${number.format(summary.centroid.distance)} cm`}
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {summary.innerShare === null ? '—' : percent.format(summary.innerShare)}
                      </td>
                      <td className="py-2 text-right tabular-nums">{gaps ? percent.format(gaps.gapShare) : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {chosen.map((record) => (
              <figure key={record.id} className="space-y-1">
                <RecordMap
                  record={record}
                  analysis={analysis}
                  label={t(`「${record.name}」の密度マップ`, `Density map of “${record.name}”`)}
                />
                <figcaption className="text-xs">{record.name}</figcaption>
              </figure>
            ))}
          </div>
          <p className="text-xs text-on-surface-variant">
            {t(
              'すき間は、円内に置いた直径の円に着弾が 1 つもない位置の割合です。円の直径が違う記録どうしは、パターン率もすき間も直接は比べられません。',
              'Gap share is the share of places in the circle where a disc of the gap diameter holds no shot. Records with different circle diameters cannot be compared directly.',
            )}
          </p>
        </>
      )}
    </div>
  );
}

/** Parses "20, 25, 30" into distances, keeping only positive numbers. */
const parseDistances = (text: string) =>
  text
    .split(/[\s,、，]+/)
    .map(Number)
    .filter((value) => Number.isFinite(value) && value > 0);

/**
 * Which setup to use at which distance, from the reader's own saved patterns. Nothing is filled in
 * from a table: a setup with no record near a distance leaves that cell empty.
 */
export function ChokePlan({ records, language }: { records: readonly PatternRecord[]; language: Language }) {
  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);
  const [distancesText, setDistancesText] = useState('20, 25, 30, 35, 40');
  const [targetPercent, setTargetPercent] = useState(NaN);
  const distances = parseDistances(distancesText);
  const plan = chokePlan(records, distances);
  const percent = new Intl.NumberFormat(language, { style: 'percent', maximumFractionDigits: 0 });
  const meets = (value: number | null) => value !== null && Number.isFinite(targetPercent) && value >= targetPercent;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 items-start gap-4">
        <div className="space-y-2">
          <label htmlFor="choke-plan-distances" className="block text-sm font-medium">
            {t('撃つ距離（m、カンマ区切り）', 'Distances to plan (m, comma-separated)')}
          </label>
          <input
            id="choke-plan-distances"
            type="text"
            inputMode="decimal"
            value={distancesText}
            onChange={(event) => setDistancesText(event.target.value)}
          />
        </div>
        <NumberField
          label={t('目標のパターン率（任意）', 'Pattern percentage wanted (optional)')}
          unit="%"
          value={targetPercent}
          min={0}
          max={100}
          onChange={setTargetPercent}
          hint={t('満たす組み合わせに印を付けます。', 'Marks the setups that reach it.')}
        />
      </div>
      {plan.length === 0 ? (
        <p className="text-sm text-on-surface-variant">
          {t(
            '装備・距離・装弾の総粒数を入れて保存した記録がまだありません。',
            'No saved measurement has a setup, a distance and a pellet count yet.',
          )}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">
              {t('装備と距離ごとの、測ったパターン率の平均', 'Mean measured pattern percentage by setup and distance')}
            </caption>
            <thead>
              <tr>
                <th scope="col" className="py-2 text-left font-medium">
                  {t('装備', 'Setup')}
                </th>
                {distances.map((distance) => (
                  <th key={distance} scope="col" className="py-2 text-right font-medium">
                    {distance} m
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {plan.map((row) => (
                <tr key={row.setup} className="border-t border-outline-variant">
                  <th scope="row" className="py-2 text-left font-normal">
                    {row.setup}
                  </th>
                  {row.cells.map((cell) => (
                    <td
                      key={cell.distanceM}
                      className={`py-2 text-right tabular-nums ${meets(cell.percent) ? 'font-medium text-primary' : ''}`}
                    >
                      {cell.percent === null ? '—' : percent.format(cell.percent / 100)}
                      {meets(cell.percent) && ' ✓'}
                      {cell.records > 1 && (
                        <span className="text-xs text-on-surface-variant">
                          {t(`（${cell.records} 件）`, ` (${cell.records})`)}
                        </span>
                      )}
                      {meets(cell.percent) && <span className="sr-only">{t('目標以上', 'reaches the target')}</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-on-surface-variant">
        {t(
          '各距離の ±2.5 m 以内の記録からパターン率を平均します。',
          'Averages the saved records within ±2.5 m of each distance.',
        )}
      </p>
    </div>
  );
}
