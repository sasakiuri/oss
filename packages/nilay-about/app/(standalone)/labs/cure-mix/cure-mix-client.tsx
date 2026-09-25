'use client';

import { useEffect, useState } from 'react';
import { LuPlus, LuTrash2 } from 'react-icons/lu';

import {
  AppHeader,
  AppLayout,
  ConditionSection,
  DiscardedSaveNotice,
  LanguageMenu,
  NumberField,
  ResetButton,
  ResultFigure,
  ResultPanel,
  SegmentedControl,
  StorageUnavailableNotice,
  ToolLayout,
  discardedSaveMessage,
} from '@/components/labs';
import { Button, Card } from '@/components/ui';
import { useStorageStatus, useDiscardedSave } from '@/lib/browser-storage';
import {
  CURE_MIX_SOURCES,
  CURE_MIX_SOURCES_CHECKED_ON,
  NITRITE_RESIDUE_LIMIT_G_PER_KG,
  calculateCureMix,
  isCureCompositionOver,
  isInvalidAmount,
  isInvalidPercent,
  leanFatBlend,
  type CureMixBasis,
  type NitriteExpressedAs,
} from '@/lib/cure-mix';
import { labsTool } from '@/lib/labs-tools';
import { CURE_MIX_MAX_INGREDIENTS, CURE_MIX_MAX_NAME } from '@/lib/schemas/cure-mix';
import { rehydrateLanguage, useLanguage, useSetLanguage } from '@/store';

import { storageKey, useCureMixStore } from './_store';

const fromField = (value: number) => (Number.isNaN(value) ? null : value);
const toField = (value: number | null) => value ?? NaN;

export function CureMixClient() {
  const settings = useCureMixStore((state) => state.settings);
  const { set, addIngredient, updateIngredient, removeIngredient, reset } = useCureMixStore.getState();
  const language = useLanguage();
  const setLanguage = useSetLanguage();
  const storageAvailable = useStorageStatus((status) => status.available);
  const discarded = useDiscardedSave(storageKey);
  const [ready, setReady] = useState(false);
  const [blend, setBlend] = useState<{
    total: number | null;
    fat: number | null;
    leanFat: number | null;
    fatFat: number | null;
  }>({ total: null, fat: null, leanFat: null, fatFat: null });
  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);

  useEffect(() => {
    void Promise.all([useCureMixStore.persist.rehydrate(), rehydrateLanguage()]).then(() => setReady(true));
  }, []);

  const result = calculateCureMix(settings);
  const number = (value: number, digits = 1) =>
    new Intl.NumberFormat(language, { maximumFractionDigits: digits }).format(value);
  const grams = (value: number) =>
    value >= 100 ? number(value, 0) : value >= 10 ? number(value, 1) : number(value, 2);
  const yen = (value: number) => `${number(value, 0)} ${t('円', 'yen')}`;

  const amountError = t('0 以上の数値を入力してください。', 'Enter a number of 0 or more.');
  const percentError = t('0〜100 の数値を入力してください。', 'Enter a number from 0 to 100.');

  const lineName = (id: string) => {
    const named: Record<string, string> = {
      lean: t('赤身', 'Lean'),
      fat: t('脂', 'Fat'),
      water: t('水・氷', 'Water or ice'),
      salt: t('食塩（加える分）', 'Salt (to add)'),
      cure: t('発色剤の製剤', 'Curing agent'),
    };
    if (named[id]) return named[id];
    const ingredient = settings.ingredients.find((item) => item.id === id);
    return ingredient?.name.trim() || t('名前のない材料', 'Unnamed ingredient');
  };

  const nitrite = result.nitrite;
  const compositionOver = settings.useCure && isCureCompositionOver(settings);
  const compositionError = t(
    '製剤の食塩と亜硝酸ナトリウムの合計が 100 % を超えています。表示を確かめてください。',
    'The salt and sodium nitrite in the agent come to more than 100 %. Check the label.',
  );
  const blendResult =
    blend.total !== null && blend.fat !== null && blend.leanFat !== null && blend.fatFat !== null
      ? leanFatBlend(blend.total, blend.fat, blend.leanFat, blend.fatFat)
      : null;

  return (
    <AppLayout
      header={
        <AppHeader
          title={labsTool('cure-mix').title[language]}
          actions={
            <>
              <ResetButton
                language={language}
                description={{
                  ja: '肉・配合・発色剤・原価の入力をすべて空にします。',
                  en: 'Clears the meat, recipe, curing agent and costs.',
                }}
                onReset={reset}
              />
              <LanguageMenu language={language} onLanguageChange={setLanguage} />
            </>
          }
        />
      }
    >
      <p className="sr-only" role="status" lang={language}>
        {discarded ? discardedSaveMessage(language) : ''}
      </p>
      <div lang={language} className="space-y-6" inert={!ready} aria-busy={!ready}>
        <DiscardedSaveNotice storageKey={storageKey} language={language} />
        <StorageUnavailableNotice available={storageAvailable} language={language} />
        <ToolLayout
          resultLabel={t('配合', 'Batch')}
          primary={
            <Card variant="outlined" className="space-y-5 rounded-md p-5 sm:p-6">
              <h2 id="meat" className="text-xl font-medium">
                {t('肉と水', 'Meat and water')}
              </h2>
              <div className="grid grid-cols-2 items-start gap-4">
                <NumberField
                  label={t('赤身', 'Lean')}
                  unit="g"
                  min={0}
                  value={toField(settings.leanG)}
                  onChange={(value) => set('leanG', fromField(value))}
                  invalid={isInvalidAmount(settings.leanG)}
                  errorText={amountError}
                />
                <NumberField
                  label={t('脂', 'Fat')}
                  unit="g"
                  min={0}
                  value={toField(settings.fatG)}
                  onChange={(value) => set('fatG', fromField(value))}
                  invalid={isInvalidAmount(settings.fatG)}
                  errorText={amountError}
                />
              </div>
              <p className="text-sm text-on-surface-variant">
                {result.fatPercent === null
                  ? t('肉の重さを入力してください。', 'Enter the weight of the meat.')
                  : t(
                      `肉 ${grams(result.meatG)} g のうち脂 ${number(result.fatPercent)} %（赤身 : 脂 = ${number(100 - result.fatPercent)} : ${number(result.fatPercent)}）`,
                      `${grams(result.meatG)} g of meat, ${number(result.fatPercent)} % fat (lean : fat = ${number(100 - result.fatPercent)} : ${number(result.fatPercent)})`,
                    )}
              </p>
              <NumberField
                label={t('水・氷', 'Water or ice')}
                unit="g"
                min={0}
                value={toField(settings.waterG)}
                onChange={(value) => set('waterG', fromField(value))}
                invalid={isInvalidAmount(settings.waterG)}
                errorText={amountError}
                hint={t('任意', 'Optional')}
              />
              <SegmentedControl
                legend={t('割合の基準', 'Percentages are of')}
                value={settings.basis}
                onChange={(value) => set('basis', value as CureMixBasis)}
                options={[
                  { value: 'meat', label: t('肉の重さ（乾塩・ソーセージ）', 'The meat (dry cure, sausage)') },
                  {
                    value: 'meatAndWater',
                    label: t('肉と水の合計（平衡ブライン）', 'Meat and water (equilibrium brine)'),
                  },
                ]}
              />
            </Card>
          }
          secondary={
            <Card variant="outlined" className="space-y-5 rounded-md p-5 sm:p-6">
              <h2 id="recipe" className="text-xl font-medium">
                {t('配合', 'Recipe')}
              </h2>
              <NumberField
                label={t('食塩', 'Salt')}
                unit="%"
                min={0}
                max={100}
                value={toField(settings.saltPercent)}
                onChange={(value) => set('saltPercent', fromField(value))}
                invalid={isInvalidPercent(settings.saltPercent)}
                errorText={percentError}
                hint={t('発色剤の製剤に含まれる食塩を含む', 'Including the salt in the curing agent')}
              />
              <fieldset className="space-y-3">
                <legend className="text-sm font-medium">{t('そのほかの材料', 'Other ingredients')}</legend>
                {settings.ingredients.map((item, index) => (
                  <div
                    key={item.id}
                    className="grid grid-cols-[minmax(0,1fr)_6rem] items-end gap-2 sm:grid-cols-[minmax(0,1fr)_6rem_7rem_auto]"
                  >
                    <div className="min-w-0 space-y-2">
                      <label htmlFor={`ingredient-${item.id}`} className="block text-sm font-medium">
                        {t(`材料 ${index + 1}`, `Ingredient ${index + 1}`)}
                      </label>
                      <input
                        id={`ingredient-${item.id}`}
                        type="text"
                        value={item.name}
                        maxLength={CURE_MIX_MAX_NAME}
                        placeholder={t('例：黒こしょう', 'e.g. black pepper')}
                        onChange={(event) => updateIngredient(item.id, { name: event.target.value })}
                      />
                    </div>
                    <NumberField
                      label={t(`材料 ${index + 1} の割合`, `Ingredient ${index + 1} share`)}
                      unit="%"
                      min={0}
                      max={100}
                      value={toField(item.percent)}
                      onChange={(value) => updateIngredient(item.id, { percent: fromField(value) })}
                      invalid={isInvalidPercent(item.percent)}
                      errorText={percentError}
                    />
                    <NumberField
                      label={t(`材料 ${index + 1} の単価`, `Ingredient ${index + 1} price`)}
                      unit={t('円/kg', 'yen/kg')}
                      min={0}
                      value={toField(item.pricePerKg)}
                      onChange={(value) => updateIngredient(item.id, { pricePerKg: fromField(value) })}
                      invalid={isInvalidAmount(item.pricePerKg)}
                      errorText={amountError}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={t(`材料 ${index + 1} を削除`, `Remove ingredient ${index + 1}`)}
                      onClick={() => removeIngredient(item.id)}
                    >
                      <LuTrash2 aria-hidden="true" />
                    </Button>
                  </div>
                ))}
                <Button
                  variant="outline"
                  onClick={addIngredient}
                  disabled={settings.ingredients.length >= CURE_MIX_MAX_INGREDIENTS}
                >
                  <LuPlus aria-hidden="true" />
                  {t('材料を追加', 'Add an ingredient')}
                </Button>
              </fieldset>

              <section aria-labelledby="cure" className="space-y-4">
                <h3 id="cure" className="text-base font-medium">
                  {t('発色剤（亜硝酸ナトリウム）', 'Curing agent (sodium nitrite)')}
                </h3>
                <label className="flex min-h-12 items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={settings.useCure}
                    onChange={(event) => set('useCure', event.target.checked)}
                  />
                  {t('亜硝酸ナトリウムを含む製剤を使う', 'Use an agent containing sodium nitrite')}
                </label>
                {settings.useCure && (
                  <>
                    <div className="grid grid-cols-2 items-start gap-4">
                      <NumberField
                        label={t('製剤の量', 'Agent')}
                        unit="%"
                        min={0}
                        max={100}
                        value={toField(settings.curePercent)}
                        onChange={(value) => set('curePercent', fromField(value))}
                        invalid={isInvalidPercent(settings.curePercent)}
                        errorText={percentError}
                        hint={t('肉 1 kg に 2.5 g なら 0.25 %', '2.5 g per kg is 0.25 %')}
                      />
                      <NumberField
                        label={t('製剤の食塩含有率', 'Salt in the agent')}
                        unit="%"
                        min={0}
                        max={100}
                        value={toField(settings.cureSaltPercent)}
                        onChange={(value) => set('cureSaltPercent', fromField(value))}
                        invalid={isInvalidPercent(settings.cureSaltPercent) || compositionOver}
                        errorText={isInvalidPercent(settings.cureSaltPercent) ? percentError : compositionError}
                      />
                    </div>
                    <NumberField
                      label={t('製剤の亜硝酸含有率', 'Nitrite in the agent')}
                      unit="%"
                      min={0}
                      max={100}
                      value={toField(settings.cureNitritePercent)}
                      onChange={(value) => set('cureNitritePercent', fromField(value))}
                      invalid={isInvalidPercent(settings.cureNitritePercent) || compositionOver}
                      errorText={isInvalidPercent(settings.cureNitritePercent) ? percentError : compositionError}
                      hint={t('表示のない製剤は使わない', 'Do not use an agent without a label')}
                    />
                    <SegmentedControl
                      legend={t('含有率の表し方', 'The label gives it as')}
                      orientation="inline"
                      value={settings.cureExpressedAs}
                      onChange={(value) => set('cureExpressedAs', value as NitriteExpressedAs)}
                      options={[
                        { value: 'sodiumNitrite', label: t('亜硝酸ナトリウム', 'Sodium nitrite') },
                        { value: 'nitrite', label: t('亜硝酸根', 'Nitrite (NO₂)') },
                      ]}
                    />
                  </>
                )}
              </section>
            </Card>
          }
          result={
            <Card variant="outlined" className="min-w-0 space-y-5 rounded-md p-5 sm:p-6">
              <h2 id="result" className="text-xl font-medium">
                {t('量る分量', 'What to weigh')}
              </h2>
              <ResultPanel>
                <ResultFigure
                  size="lead"
                  label={t('できあがりの合計', 'Batch total')}
                  value={result.totalG > 0 ? grams(result.totalG) : '—'}
                  unit={result.totalG > 0 ? 'g' : undefined}
                  note={
                    result.saltPercentOfTotal !== null && result.saltPercentOfTotal > 0
                      ? t(
                          `食塩は全体の ${number(result.saltPercentOfTotal, 2)} %`,
                          `Salt is ${number(result.saltPercentOfTotal, 2)} % of the batch`,
                        )
                      : undefined
                  }
                />
              </ResultPanel>
              <table className="w-full text-sm">
                <caption className="sr-only">{t('材料ごとの重さ', 'Weight of each ingredient')}</caption>
                <thead>
                  <tr className="text-left text-on-surface-variant">
                    <th scope="col" className="py-1 font-normal">
                      {t('材料', 'Ingredient')}
                    </th>
                    <th scope="col" className="py-1 text-right font-normal">
                      g
                    </th>
                    <th scope="col" className="py-1 text-right font-normal">
                      {t('原価', 'Cost')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {result.lines
                    .filter((line) => line.grams > 0)
                    .map((line) => (
                      <tr key={line.id} className="border-t border-outline-variant">
                        <th scope="row" className="py-2 text-left font-normal">
                          {lineName(line.id)}
                        </th>
                        <td className="py-2 text-right tabular-nums">{grams(line.grams)}</td>
                        <td className="py-2 text-right tabular-nums">{line.cost === null ? '—' : yen(line.cost)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
              {settings.useCure && result.saltFromCureG > 0 && (
                <p className="text-sm text-on-surface-variant">
                  {t(
                    `製剤の食塩 ${grams(result.saltFromCureG)} g を、加える食塩から差し引いています。`,
                    `The ${grams(result.saltFromCureG)} g of salt in the agent is taken off the salt to add.`,
                  )}
                </p>
              )}
              {result.saltShortfall && (
                <p className="text-sm text-destructive">
                  {t(
                    '製剤に含まれる食塩だけで、食塩の割合を超えています。',
                    'The agent alone brings more salt than the recipe asks for.',
                  )}
                </p>
              )}

              {nitrite.kind === 'incomplete' && (
                <p className="text-sm text-destructive">
                  {t('製剤の亜硝酸含有率を入力してください。', 'Enter the nitrite in the agent.')}
                </p>
              )}
              {nitrite.kind === 'composition' && <p className="text-sm text-destructive">{compositionError}</p>}
              {nitrite.kind === 'added' && (
                <div className="space-y-2 rounded-sm bg-surface-container p-4 text-sm">
                  <p className="font-medium">
                    {t(
                      `加える亜硝酸根：全体 1 kg あたり ${number(nitrite.mgPerKg, 1)} mg（${number(nitrite.mgPerKg / 1000, 4)} g）`,
                      `Nitrite added: ${number(nitrite.mgPerKg, 1)} mg (${number(nitrite.mgPerKg / 1000, 4)} g) per kg of batch`,
                    )}
                  </p>
                  <p>
                    {t(
                      `使用基準は完成品 1 kg に残る亜硝酸根 ${NITRITE_RESIDUE_LIMIT_G_PER_KG.toFixed(3)} g まで。乾燥で濃くなり、加熱や保存で減るため、残存量は検査で確かめます。`,
                      `The Japanese limit is ${NITRITE_RESIDUE_LIMIT_G_PER_KG.toFixed(3)} g of nitrite remaining per kg of finished product. Drying concentrates it and heating and storage reduce it, so test what remains.`,
                    )}
                  </p>
                </div>
              )}
              <p className="text-xs text-on-surface-variant">
                {t(
                  'ハム・ソーセージ・ベーコンなどを販売するには食肉製品製造業の許可が必要です。',
                  'Selling ham, sausage or bacon in Japan needs a meat product manufacturing licence.',
                )}
              </p>
            </Card>
          }
          extras={
            <>
              <ConditionSection
                id="blend"
                title={t('脂の割合を合わせる', 'Blend to a fat share')}
                summary={
                  blendResult
                    ? t(
                        `赤身 ${grams(blendResult.leanG)} g、脂身 ${grams(blendResult.fatG)} g`,
                        `Lean ${grams(blendResult.leanG)} g, fat trim ${grams(blendResult.fatG)} g`,
                      )
                    : t('未入力', 'Nothing entered')
                }
              >
                <div className="grid grid-cols-2 items-start gap-4">
                  <NumberField
                    label={t('合計の肉', 'Total meat')}
                    unit="g"
                    min={0}
                    value={toField(blend.total)}
                    onChange={(value) => setBlend({ ...blend, total: fromField(value) })}
                  />
                  <NumberField
                    label={t('目標の脂の割合', 'Target fat')}
                    unit="%"
                    min={0}
                    max={100}
                    value={toField(blend.fat)}
                    onChange={(value) => setBlend({ ...blend, fat: fromField(value) })}
                  />
                  <NumberField
                    label={t('赤身の脂の割合', 'Fat in the lean')}
                    unit="%"
                    min={0}
                    max={100}
                    value={toField(blend.leanFat)}
                    onChange={(value) => setBlend({ ...blend, leanFat: fromField(value) })}
                  />
                  <NumberField
                    label={t('脂身の脂の割合', 'Fat in the fat trim')}
                    unit="%"
                    min={0}
                    max={100}
                    value={toField(blend.fatFat)}
                    onChange={(value) => setBlend({ ...blend, fatFat: fromField(value) })}
                  />
                </div>
                <p className="text-sm text-on-surface-variant">
                  {t('純粋な赤身と脂なら 0 % と 100 %。', 'Pure lean and pure fat are 0 % and 100 %.')}
                </p>
                {blendResult ? (
                  <div className="space-y-2">
                    <p className="text-sm">
                      {t(
                        `赤身 ${grams(blendResult.leanG)} g、脂身 ${grams(blendResult.fatG)} g`,
                        `Lean ${grams(blendResult.leanG)} g, fat trim ${grams(blendResult.fatG)} g`,
                      )}
                    </p>
                    <Button
                      variant="outline"
                      onClick={() => {
                        set('leanG', Math.round(blendResult.leanG));
                        set('fatG', Math.round(blendResult.fatG));
                      }}
                    >
                      {t('この量を肉の欄に入れる', 'Use these weights')}
                    </Button>
                  </div>
                ) : (
                  blend.total !== null &&
                  blend.fat !== null &&
                  blend.leanFat !== null &&
                  blend.fatFat !== null && (
                    <p className="text-sm text-destructive">
                      {t(
                        '目標の割合は、赤身と脂身の脂の割合の間にしてください。',
                        'The target must lie between the two trimmings’ fat contents.',
                      )}
                    </p>
                  )
                )}
              </ConditionSection>

              <ConditionSection
                id="casing"
                title={t('充填と原価', 'Casing and cost')}
                summary={
                  result.cost === null
                    ? t('単価未入力', 'No prices entered')
                    : t(`原価 ${yen(result.cost)}`, `Cost ${yen(result.cost)}`)
                }
              >
                <div className="grid grid-cols-2 items-start gap-4">
                  <NumberField
                    label={t('1 本の重さ', 'Link weight')}
                    unit="g"
                    min={0}
                    value={toField(settings.linkG)}
                    onChange={(value) => set('linkG', fromField(value))}
                    invalid={isInvalidAmount(settings.linkG)}
                    errorText={amountError}
                  />
                  <NumberField
                    label={t('ケーシング 1 m の充填量', 'Fill per metre of casing')}
                    unit="g/m"
                    min={0}
                    value={toField(settings.casingGPerM)}
                    onChange={(value) => set('casingGPerM', fromField(value))}
                    invalid={isInvalidAmount(settings.casingGPerM)}
                    errorText={amountError}
                  />
                  <NumberField
                    label={t('赤身の単価', 'Lean price')}
                    unit={t('円/kg', 'yen/kg')}
                    min={0}
                    value={toField(settings.leanPricePerKg)}
                    onChange={(value) => set('leanPricePerKg', fromField(value))}
                    invalid={isInvalidAmount(settings.leanPricePerKg)}
                    errorText={amountError}
                  />
                  <NumberField
                    label={t('脂の単価', 'Fat price')}
                    unit={t('円/kg', 'yen/kg')}
                    min={0}
                    value={toField(settings.fatPricePerKg)}
                    onChange={(value) => set('fatPricePerKg', fromField(value))}
                    invalid={isInvalidAmount(settings.fatPricePerKg)}
                    errorText={amountError}
                  />
                  <NumberField
                    label={t('食塩の単価', 'Salt price')}
                    unit={t('円/kg', 'yen/kg')}
                    min={0}
                    value={toField(settings.saltPricePerKg)}
                    onChange={(value) => set('saltPricePerKg', fromField(value))}
                    invalid={isInvalidAmount(settings.saltPricePerKg)}
                    errorText={amountError}
                  />
                  {settings.useCure && (
                    <NumberField
                      label={t('製剤の単価', 'Agent price')}
                      unit={t('円/kg', 'yen/kg')}
                      min={0}
                      value={toField(settings.curePricePerKg)}
                      onChange={(value) => set('curePricePerKg', fromField(value))}
                      invalid={isInvalidAmount(settings.curePricePerKg)}
                      errorText={amountError}
                    />
                  )}
                  <NumberField
                    label={t('ケーシングの単価', 'Casing price')}
                    unit={t('円/m', 'yen/m')}
                    min={0}
                    value={toField(settings.casingPricePerM)}
                    onChange={(value) => set('casingPricePerM', fromField(value))}
                    invalid={isInvalidAmount(settings.casingPricePerM)}
                    errorText={amountError}
                  />
                </div>
                <dl className="grid gap-3 rounded-sm bg-surface-container p-4 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-on-surface-variant">{t('本数', 'Links')}</dt>
                    <dd className="mt-1 text-xl font-medium tabular-nums">
                      {result.links ? number(result.links.count, 0) : '—'}
                    </dd>
                    {result.links && settings.linkG !== null && result.links.lastLinkG < settings.linkG && (
                      <dd className="text-on-surface-variant">
                        {t(
                          `最後の 1 本は約 ${grams(result.links.lastLinkG)} g`,
                          `The last link is about ${grams(result.links.lastLinkG)} g`,
                        )}
                      </dd>
                    )}
                  </div>
                  <div>
                    <dt className="text-on-surface-variant">{t('ケーシングの長さ', 'Casing length')}</dt>
                    <dd className="mt-1 text-xl font-medium tabular-nums">
                      {result.casing ? `${number(result.casing.metres, 2)} m` : '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-on-surface-variant">{t('原価の合計', 'Total cost')}</dt>
                    <dd className="mt-1 text-xl font-medium tabular-nums">
                      {result.cost === null ? '—' : yen(result.cost)}
                    </dd>
                    {result.unpricedLines > 0 && result.cost !== null && (
                      <dd className="text-on-surface-variant">
                        {t(
                          `単価のない材料 ${result.unpricedLines} 件を除く`,
                          `Leaving out ${result.unpricedLines} unpriced`,
                        )}
                      </dd>
                    )}
                  </div>
                  <div>
                    <dt className="text-on-surface-variant">{t('1 kg あたり', 'Per kg')}</dt>
                    <dd className="mt-1 text-xl font-medium tabular-nums">
                      {result.costPerKg === null ? '—' : yen(result.costPerKg)}
                    </dd>
                  </div>
                </dl>
              </ConditionSection>

              <ConditionSection
                id="standards"
                title={t('加熱と使用基準', 'Cooking and standards')}
                summary={t(
                  `出典（${CURE_MIX_SOURCES_CHECKED_ON} 確認）`,
                  `Sources (checked ${CURE_MIX_SOURCES_CHECKED_ON})`,
                )}
              >
                <div className="space-y-3 text-sm">
                  <p>
                    {t(
                      '野生鳥獣肉は、中心部の温度が 75℃ で 1 分間以上、またはこれと同等以上の効力を有する方法で十分に加熱して食べます（自家消費を含む。ガイドライン 第 6）。',
                      'Game meat must be cooked until the centre reaches 75 °C for at least 1 minute, or an equally effective method (including for your own use; MHLW guideline, part 6).',
                    )}
                  </p>
                  <p className="text-on-surface-variant">
                    {t(
                      '食肉製品の製造基準は、加熱食肉製品を「中心部の温度を 63℃ で 30 分間加熱する方法又はこれと同等以上の効力を有する方法」で殺菌するとしています。これは食肉製品製造業の基準です。',
                      'The manufacturing standard for heated meat products sets 63 °C at the centre for 30 minutes or equivalent. That is a standard for licensed meat product makers.',
                    )}
                  </p>
                  <p className="text-on-surface-variant">
                    {t(
                      `亜硝酸ナトリウムの使用基準は、食肉製品 1 kg につき亜硝酸根として ${NITRITE_RESIDUE_LIMIT_G_PER_KG.toFixed(3)} g を超えて「残存しないように」使うことです。上の「加える亜硝酸根」は、加える量を仕込み全体の重さで割った値です。亜硝酸ナトリウムから亜硝酸根への換算は原子量による（1 g あたり 0.6668 g）。`,
                      `Sodium nitrite may be used so that no more than ${NITRITE_RESIDUE_LIMIT_G_PER_KG.toFixed(3)} g of nitrite per kg remains in a meat product. The nitrite added above is the amount added divided by the whole batch. Sodium nitrite is converted to nitrite by atomic weights (0.6668 g per g).`,
                    )}
                  </p>
                  <p className="text-on-surface-variant">
                    {t(
                      '乾燥・非加熱の食肉製品には、水分活性や食塩・亜硝酸ナトリウムの量など別の製造基準があります。',
                      'Dried and unheated meat products have further manufacturing standards (water activity, salt and nitrite added).',
                    )}
                  </p>
                  <ul className="list-disc space-y-2 pl-5">
                    {Object.values(CURE_MIX_SOURCES).map((source) => (
                      <li key={source.url}>
                        <a href={source.url} target="_blank" rel="noreferrer" className="underline">
                          {source.title}
                        </a>
                        <span className="text-on-surface-variant">　{source.note}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </ConditionSection>
            </>
          }
        />
      </div>
    </AppLayout>
  );
}
