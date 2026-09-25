'use client';

import { LuPlus, LuTrash2 } from 'react-icons/lu';

import { ConditionSection, NumberField } from '@/components/labs';
import { Button } from '@/components/ui';
import { GAME_CUTS_CHECKED_ON, GAME_CUTS_SOURCES } from '@/lib/game-cuts';
import { animalBalance, partsBreakdown } from '@/lib/meat-yield';
import {
  MEAT_YIELD_MAX_NAME,
  MEAT_YIELD_MAX_ROWS,
  type MeatYieldCost,
  type MeatYieldPart,
} from '@/lib/schemas/meat-yield';

import { useMeatYieldStore } from './_store';

// Settings saved before the cuts existed have none of them: read as nothing entered.
const NONE_PARTS: readonly MeatYieldPart[] = [];
const NONE_COSTS: readonly MeatYieldCost[] = [];

const fromField = (value: number) => (Number.isNaN(value) ? null : value);
const toField = (value: number | null) => value ?? NaN;
const invalidPercent = (value: number | null) => value !== null && !(value >= 0 && value <= 100);
const invalidYen = (value: number | null) => value !== null && !(value >= 0);

/**
 * The usable meat split into the cuts it is sold as, priced per kilogram, and what one animal brings
 * in once its costs and any subsidy are counted. No share or price is filled in: the cut chart names the
 * cuts but gives no share for them, and prices and fees are the reader's own.
 */
export function MeatYieldSales({ language, meatKg }: { language: 'ja' | 'en'; meatKg: number | null }) {
  const species = useMeatYieldStore((state) => state.species);
  const parts = useMeatYieldStore((state) => state.parts) ?? NONE_PARTS;
  const costs = useMeatYieldStore((state) => state.costs) ?? NONE_COSTS;
  const subsidyYen = useMeatYieldStore((state) => state.subsidyYen) ?? null;
  const { addChartCuts, addPart, updatePart, removePart, addCost, updateCost, removeCost, setSubsidyYen } =
    useMeatYieldStore.getState();
  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);
  const number = (value: number, digits = 1) =>
    new Intl.NumberFormat(language, { maximumFractionDigits: digits }).format(value);
  const yen = (value: number) => `${number(value, 0)} ${t('円', 'yen')}`;

  const breakdown = partsBreakdown(meatKg, parts);
  const balance = animalBalance(breakdown.sales, costs, subsidyYen);
  const percentError = t('0〜100 の数値を入力してください。', 'Enter a number from 0 to 100.');
  const yenError = t('0 以上の数値を入力してください。', 'Enter a number of 0 or more.');

  return (
    <ConditionSection
      id="sales"
      title={t('部位別の内訳と 1 頭の収支', 'Cuts, sales and the balance per animal')}
      summary={
        parts.length === 0 && costs.length === 0
          ? t('未入力', 'Nothing entered')
          : t(
              `売上 ${yen(balance.sales)}・収支 ${yen(balance.net)}`,
              `Sales ${yen(balance.sales)}, balance ${yen(balance.net)}`,
            )
      }
      forceOpen={breakdown.overAssigned}
    >
      <p className="text-sm text-on-surface-variant">
        {t('割合は食肉にできる部位に対する % です。', 'Shares are of the usable meat.')}
      </p>
      <div className="space-y-3">
        {parts.map((part, index) => {
          const line = breakdown.lines[index];
          return (
            <div
              key={part.id}
              className="grid grid-cols-2 items-end gap-2 border-t border-outline-variant pt-3 sm:grid-cols-[minmax(0,1fr)_6rem_7rem_auto]"
            >
              <div className="col-span-2 min-w-0 space-y-2 sm:col-span-1">
                <label htmlFor={`part-${part.id}`} className="block text-sm font-medium">
                  {t(`部位 ${index + 1}`, `Cut ${index + 1}`)}
                </label>
                <input
                  id={`part-${part.id}`}
                  type="text"
                  value={part.name}
                  maxLength={MEAT_YIELD_MAX_NAME}
                  onChange={(event) => updatePart(part.id, { name: event.target.value })}
                />
              </div>
              <NumberField
                label={t(`${part.name || `部位 ${index + 1}`}の割合`, `${part.name || `Cut ${index + 1}`} share`)}
                unit="%"
                min={0}
                max={100}
                value={toField(part.percent)}
                onChange={(value) => updatePart(part.id, { percent: fromField(value) })}
                invalid={invalidPercent(part.percent)}
                errorText={percentError}
              />
              <NumberField
                label={t(`${part.name || `部位 ${index + 1}`}の単価`, `${part.name || `Cut ${index + 1}`} price`)}
                unit={t('円/kg', 'yen/kg')}
                min={0}
                value={toField(part.pricePerKg)}
                onChange={(value) => updatePart(part.id, { pricePerKg: fromField(value) })}
                invalid={invalidYen(part.pricePerKg)}
                errorText={yenError}
              />
              <Button
                variant="ghost"
                size="sm"
                aria-label={t(`${part.name || `部位 ${index + 1}`}を削除`, `Remove ${part.name || `cut ${index + 1}`}`)}
                onClick={() => removePart(part.id)}
              >
                <LuTrash2 aria-hidden="true" />
              </Button>
              <p className="col-span-2 text-sm tabular-nums text-on-surface-variant sm:col-span-4">
                {line?.kg === null || line === undefined
                  ? t('重さ —', 'Weight —')
                  : t(`約 ${number(line.kg, 2)} kg`, `About ${number(line.kg, 2)} kg`)}
                {line?.sales !== null && line?.sales !== undefined && t(`・${yen(line.sales)}`, `, ${yen(line.sales)}`)}
              </p>
            </div>
          );
        })}
        <div className="flex flex-wrap gap-2">
          {species !== 'other' && (
            <Button
              variant="outline"
              onClick={() => addChartCuts(language)}
              disabled={parts.length >= MEAT_YIELD_MAX_ROWS}
            >
              {t('カットチャートの部位名を入れる', 'Add the chart’s cut names')}
            </Button>
          )}
          <Button variant="outline" onClick={addPart} disabled={parts.length >= MEAT_YIELD_MAX_ROWS}>
            <LuPlus aria-hidden="true" />
            {t('部位を追加', 'Add a cut')}
          </Button>
        </div>
        {parts.length > 0 && (
          <p className={breakdown.overAssigned ? 'text-sm text-destructive' : 'text-sm text-on-surface-variant'}>
            {breakdown.overAssigned
              ? t(
                  `割合の合計が ${number(breakdown.assignedPercent)} % です。100 % 以下にしてください。`,
                  `The shares add up to ${number(breakdown.assignedPercent)} %. Keep them to 100 % or less.`,
                )
              : t(
                  `割合の合計 ${number(breakdown.assignedPercent)} %（残り ${number(100 - breakdown.assignedPercent)} % は売上に含めません）`,
                  `Shares add up to ${number(breakdown.assignedPercent)} % (the other ${number(100 - breakdown.assignedPercent)} % is not counted in sales)`,
                )}
          </p>
        )}
      </div>

      <div className="space-y-3">
        <h3 className="text-base font-medium">{t('1 頭あたりの費用と収入', 'Costs and income per animal')}</h3>
        {costs.map((cost, index) => (
          <div key={cost.id} className="grid grid-cols-[minmax(0,1fr)_8rem_auto] items-end gap-2">
            <div className="min-w-0 space-y-2">
              <label htmlFor={`cost-${cost.id}`} className="block text-sm font-medium">
                {t(`費用 ${index + 1}`, `Cost ${index + 1}`)}
              </label>
              <input
                id={`cost-${cost.id}`}
                type="text"
                value={cost.name}
                maxLength={MEAT_YIELD_MAX_NAME}
                placeholder={t('例：処理料金、包装資材', 'e.g. processing fee, packaging')}
                onChange={(event) => updateCost(cost.id, { name: event.target.value })}
              />
            </div>
            <NumberField
              label={t(`${cost.name || `費用 ${index + 1}`}の金額`, `${cost.name || `Cost ${index + 1}`} amount`)}
              unit={t('円', 'yen')}
              min={0}
              value={toField(cost.yen)}
              onChange={(value) => updateCost(cost.id, { yen: fromField(value) })}
              invalid={invalidYen(cost.yen)}
              errorText={yenError}
            />
            <Button
              variant="ghost"
              size="sm"
              aria-label={t(`${cost.name || `費用 ${index + 1}`}を削除`, `Remove ${cost.name || `cost ${index + 1}`}`)}
              onClick={() => removeCost(cost.id)}
            >
              <LuTrash2 aria-hidden="true" />
            </Button>
          </div>
        ))}
        <Button variant="outline" onClick={addCost} disabled={costs.length >= MEAT_YIELD_MAX_ROWS}>
          <LuPlus aria-hidden="true" />
          {t('費用を追加', 'Add a cost')}
        </Button>
        <NumberField
          label={t('捕獲の交付金などの収入', 'Capture subsidy or other income')}
          unit={t('円', 'yen')}
          min={0}
          value={toField(subsidyYen)}
          onChange={(value) => setSubsidyYen(fromField(value))}
          invalid={invalidYen(subsidyYen)}
          errorText={yenError}
        />
      </div>

      <dl className="grid gap-3 rounded-sm bg-surface-container p-4 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-on-surface-variant">{t('売上', 'Sales')}</dt>
          <dd className="mt-1 text-xl font-medium tabular-nums">{yen(balance.sales)}</dd>
          {breakdown.unpriced > 0 && (
            <dd className="text-on-surface-variant">
              {t(`単価のない部位 ${breakdown.unpriced} 件を除く`, `Leaving out ${breakdown.unpriced} unpriced cuts`)}
            </dd>
          )}
        </div>
        <div>
          <dt className="text-on-surface-variant">{t('1 頭あたりの収支', 'Balance per animal')}</dt>
          <dd className={`mt-1 text-xl font-medium tabular-nums ${balance.net < 0 ? 'text-destructive' : ''}`}>
            {yen(balance.net)}
          </dd>
          <dd className="text-on-surface-variant">
            {t(
              `売上 ${yen(balance.sales)} ＋ 収入 ${yen(balance.subsidy)} − 費用 ${yen(balance.costs)}`,
              `Sales ${yen(balance.sales)} + income ${yen(balance.subsidy)} − costs ${yen(balance.costs)}`,
            )}
          </dd>
        </div>
      </dl>
      <p className="text-xs text-on-surface-variant">
        {t('部位名：', 'Cut names: ')}
        <a href={GAME_CUTS_SOURCES.chart.url} target="_blank" rel="noreferrer" className="underline">
          {GAME_CUTS_SOURCES.chart.title}
        </a>
        {t(`（${GAME_CUTS_CHECKED_ON} 確認）`, ` (checked ${GAME_CUTS_CHECKED_ON})`)}
      </p>
    </ConditionSection>
  );
}
