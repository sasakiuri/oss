'use client';

import { useEffect, useMemo, useState } from 'react';

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
import { Card } from '@/components/ui';
import { useDiscardedSave, useStorageStatus } from '@/lib/browser-storage';
import { labsTool } from '@/lib/labs-tools';
import { MAX_FILLS, fromBar, planFills, toBar, type PressureUnit } from '@/lib/pcp-fill';
import { rehydrateLanguage, useLanguage, useSetLanguage } from '@/store';

import { storageKey, usePcpFillStore } from './_store';

const UNIT_LABEL: Record<PressureUnit, string> = { bar: 'bar', mpa: 'MPa', psi: 'psi' };
/** The table shows the first fills and the last; the count covers them all. */
const TABLE_HEAD = 30;

export function PcpFillClient() {
  const {
    pressureUnit,
    tankLitres,
    tankPressure,
    fillPressure,
    refillPressure,
    gunCc,
    hoseCc,
    shotsPerFill,
    edit,
    setPressureUnit,
    reset,
  } = usePcpFillStore();
  const language = useLanguage();
  const setLanguage = useSetLanguage();
  const storageAvailable = useStorageStatus((status) => status.available);
  const discarded = useDiscardedSave(storageKey);
  const [ready, setReady] = useState(false);
  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);
  const number = (value: number, digits = 1) =>
    new Intl.NumberFormat(language, { maximumFractionDigits: digits }).format(value);
  const pressure = (bar: number) =>
    `${number(fromBar(bar, pressureUnit), pressureUnit === 'mpa' ? 2 : pressureUnit === 'psi' ? 0 : 1)} ${UNIT_LABEL[pressureUnit]}`;

  useEffect(() => {
    void Promise.all([usePcpFillStore.persist.rehydrate(), rehydrateLanguage()]).then(() => setReady(true));
  }, []);

  const plan = useMemo(
    () =>
      planFills({
        tankLitres,
        tankBar: toBar(tankPressure, pressureUnit),
        fillBar: toBar(fillPressure, pressureUnit),
        refillBar: toBar(refillPressure, pressureUnit),
        gunCc,
        hoseCc,
      }),
    [tankLitres, tankPressure, fillPressure, refillPressure, gunCc, hoseCc, pressureUnit],
  );
  const positive = (value: number) => Number.isFinite(value) && value > 0;
  const nonNegative = (value: number) => Number.isFinite(value) && value >= 0;
  const unit = UNIT_LABEL[pressureUnit];
  const partial = plan.kind === 'ok' ? plan.steps.find((step) => !step.full) : undefined;
  const rows =
    plan.kind === 'ok'
      ? plan.steps.length > TABLE_HEAD + 5
        ? [...plan.steps.slice(0, TABLE_HEAD), null, ...plan.steps.slice(-5)]
        : plan.steps
      : [];

  return (
    <AppLayout
      header={
        <AppHeader
          title={labsTool('pcp-fill').title[language]}
          actions={
            <>
              <ResetButton
                language={language}
                description={{
                  ja: 'ボンベと銃の条件を初期値に戻します。',
                  en: 'Resets the cylinder and gun to the defaults.',
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
          resultLabel={t('充填回数', 'Fills')}
          primary={
            <Card variant="outlined" className="space-y-4 rounded-md p-5 sm:p-6">
              <h2 className="text-xl font-medium">{t('ボンベと銃', 'Cylinder and gun')}</h2>
              <SegmentedControl
                legend={t('圧力の単位', 'Pressure unit')}
                orientation="inline"
                value={pressureUnit}
                onChange={(value) => setPressureUnit(value as PressureUnit)}
                options={[
                  { value: 'bar', label: 'bar' },
                  { value: 'mpa', label: 'MPa' },
                  { value: 'psi', label: 'psi' },
                ]}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <NumberField
                  label={t('ボンベの内容積', 'Cylinder water capacity')}
                  unit="L"
                  value={tankLitres}
                  onChange={(value) => edit({ tankLitres: value })}
                  min={0}
                  invalid={!positive(tankLitres)}
                  errorText={t('0 より大きい数値を入力してください。', 'Enter a number greater than zero.')}
                />
                <NumberField
                  label={t('ボンベの圧力', 'Cylinder pressure')}
                  unit={unit}
                  value={tankPressure}
                  onChange={(value) => edit({ tankPressure: value })}
                  min={0}
                  invalid={!nonNegative(tankPressure)}
                  errorText={t('0 以上の数値を入力してください。', 'Enter zero or more.')}
                />
                <NumberField
                  label={t('銃の気室の容積', 'Gun reservoir volume')}
                  unit="cc"
                  value={gunCc}
                  onChange={(value) => edit({ gunCc: value })}
                  min={0}
                  invalid={!positive(gunCc)}
                  errorText={t('0 より大きい数値を入力してください。', 'Enter a number greater than zero.')}
                />
                <NumberField
                  label={t('ホースの容積', 'Hose volume')}
                  unit="cc"
                  value={hoseCc}
                  onChange={(value) => edit({ hoseCc: value })}
                  min={0}
                  invalid={!nonNegative(hoseCc)}
                  errorText={t('0 以上の数値を入力してください。', 'Enter zero or more.')}
                  hint={t('充填のたびに抜く空気。わからなければ 0。', 'Bled after every fill. 0 if unknown.')}
                />
                <NumberField
                  label={t('充填する圧力', 'Fill to')}
                  unit={unit}
                  value={fillPressure}
                  onChange={(value) => edit({ fillPressure: value })}
                  min={0}
                  invalid={plan.kind === 'invalid' && plan.problem !== 'volumes'}
                  errorText={t(
                    '充填前の圧力より高くしてください。',
                    'Make it higher than the pressure before filling.',
                  )}
                />
                <NumberField
                  label={t('充填前の銃の圧力', 'Gun pressure before filling')}
                  unit={unit}
                  value={refillPressure}
                  onChange={(value) => edit({ refillPressure: value })}
                  min={0}
                  invalid={!nonNegative(refillPressure)}
                  errorText={t('0 以上の数値を入力してください。', 'Enter zero or more.')}
                />
                <NumberField
                  label={t('1 回の充填で撃てる発数（任意）', 'Shots per fill (optional)')}
                  value={shotsPerFill ?? NaN}
                  onChange={(value) => edit({ shotsPerFill: Number.isNaN(value) ? null : value })}
                  min={0}
                  invalid={shotsPerFill !== null && !positive(shotsPerFill)}
                  errorText={t('0 より大きい数値を入力してください。', 'Enter a number greater than zero.')}
                />
              </div>
              <p className="text-xs text-on-surface-variant">
                {t('圧力はゲージの読み（大気圧との差）です。', 'Pressures are gauge readings, above atmospheric.')}
              </p>
            </Card>
          }
          result={
            <Card variant="outlined" className="min-w-0 space-y-5 rounded-md p-5 sm:p-6">
              <h2 className="text-xl font-medium">{t('充填回数', 'Fills')}</h2>
              {plan.kind === 'invalid' ? (
                <p className="rounded-sm bg-error-container p-4 text-sm text-on-error-container">
                  {t('入力を確認してください。', 'Check the values.')}
                </p>
              ) : (
                <>
                  <ResultPanel className="grid-cols-2">
                    <div className="col-span-2">
                      <ResultFigure
                        size="lead"
                        label={t('満充填できる回数', 'Full fills')}
                        value={plan.truncated ? `${number(MAX_FILLS, 0)}+` : number(plan.fullFills, 0)}
                        note={
                          shotsPerFill !== null && positive(shotsPerFill)
                            ? t(
                                `約 ${number(plan.fullFills * shotsPerFill, 0)} 発`,
                                `About ${number(plan.fullFills * shotsPerFill, 0)} shots`,
                              )
                            : undefined
                        }
                      />
                    </div>
                    <ResultFigure
                      label={t('最後の充填（途中まで）', 'Last, partial fill')}
                      value={partial ? pressure(partial.gunBar) : '—'}
                    />
                    <ResultFigure
                      label={t('ボンベに残る圧力', 'Left in the cylinder')}
                      value={pressure(plan.tankLeftBar)}
                    />
                  </ResultPanel>
                  {plan.steps.length === 0 && (
                    <p className="text-sm text-on-surface-variant">
                      {t('ボンベの圧力が銃の圧力以下です。', 'The cylinder pressure is not above the gun’s.')}
                    </p>
                  )}
                  {rows.length > 0 && (
                    <table className="w-full text-sm tabular-nums">
                      <caption className="mb-1 text-left font-medium">
                        {t('充填ごとの圧力', 'Pressure after each fill')}
                      </caption>
                      <thead>
                        <tr className="text-left text-on-surface-variant">
                          <th scope="col" className="font-normal">
                            {t('回', 'Fill')}
                          </th>
                          <th scope="col" className="font-normal">
                            {t('銃', 'Gun')}
                          </th>
                          <th scope="col" className="font-normal">
                            {t('ボンベ', 'Cylinder')}
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-outline-variant">
                        {rows.map((step, index) =>
                          step === null ? (
                            <tr key={`gap-${index}`}>
                              <td colSpan={3} className="py-1 text-on-surface-variant">
                                …
                              </td>
                            </tr>
                          ) : (
                            <tr key={step.number}>
                              <th scope="row" className="py-1 text-left font-normal">
                                {step.number}
                                {step.full ? '' : t('（途中まで）', ' (partial)')}
                              </th>
                              <td>{pressure(step.gunBar)}</td>
                              <td>{pressure(step.tankAfterBar)}</td>
                            </tr>
                          ),
                        )}
                      </tbody>
                    </table>
                  )}
                </>
              )}
            </Card>
          }
          extras={
            <ConditionSection
              id="pcp-method"
              title={t('計算方法と注意', 'Method and limits')}
              summary={t('ボイルの法則（等温・理想気体）', "Boyle's law, constant temperature, ideal gas")}
            >
              <ul className="list-disc space-y-2 pl-5 text-sm">
                <li>
                  {t(
                    '空気の量は絶対圧 × 容積（ボイルの法則）。ボンベ・銃・ホースをつないで釣り合う圧力が充填する圧力以上なら満充填、下回ればその圧力で止まります。絶対圧はゲージ圧 + 1.01325 bar。',
                    'Air quantity is absolute pressure times volume (Boyle’s law). A fill is full if the cylinder, gun and hose balance at or above the fill pressure, and stops at the balance pressure if not. Absolute pressure is gauge + 1.01325 bar.',
                  )}
                </li>
                <li>
                  {t(
                    '200〜300 bar の空気は理想気体より圧縮されにくいため、実際の回数は計算より少なくなります。',
                    'At 200 to 300 bar air is less compressible than an ideal gas, so expect fewer fills than calculated.',
                  )}
                </li>
                <li>
                  {t(
                    '充填直後は空気が温まっていて、冷えると圧力が下がります。ゲージは冷えてから読みます。',
                    'Filling warms the air and the pressure drops as it cools. Read the gauges once cool.',
                  )}
                </li>
                <li>
                  {t(
                    '銃とボンベの最高充填圧力を超えないこと。高圧ガス容器の充填・点検は高圧ガス保安法の対象です。',
                    'Never exceed the gun’s or the cylinder’s maximum fill pressure. Filling and inspecting high-pressure cylinders falls under the High Pressure Gas Safety Act.',
                  )}
                </li>
              </ul>
            </ConditionSection>
          }
        />
      </div>
    </AppLayout>
  );
}
