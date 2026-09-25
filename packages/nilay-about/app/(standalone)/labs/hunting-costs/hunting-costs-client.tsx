'use client';

import { useEffect, useState } from 'react';
import { LuPlus, LuTrash2 } from 'react-icons/lu';

import {
  AppHeader,
  AppLayout,
  ConditionSection,
  DateField,
  DiscardedSaveNotice,
  LanguageMenu,
  NumberField,
  ResetButton,
  ResultFigure,
  ResultPanel,
  SelectField,
  StorageUnavailableNotice,
  ToolLayout,
  discardedSaveMessage,
} from '@/components/labs';
import { Button, Card } from '@/components/ui';
import { useDiscardedSave, useStorageStatus } from '@/lib/browser-storage';
import {
  COSTS_CHECKED_ON,
  COST_SCENARIOS,
  COST_SOURCES,
  HUNTING_TAX,
  STANDARD_FEES,
  TAX_RELIEF_LAST_DAY,
  calculateHuntingCosts,
  reliefPeriod,
  type CostProblem,
  type CostScenario,
} from '@/lib/hunting-costs';
import { labsTool } from '@/lib/labs-tools';
import { LICENSE_NAMES, prefectureName } from '@/lib/prefecture-names';
import {
  HUNTING_COSTS_MAX_LABEL,
  HUNTING_COSTS_MAX_OTHER,
  HUNTING_COSTS_MAX_REGISTRATIONS,
  HUNTING_COSTS_MAX_YEN,
  type FeeSchedule,
  type ReleaseArea,
  type TaxRelief,
} from '@/lib/schemas/hunting-costs';
import { LICENSE_TYPES, PREFECTURES, type LicenseType, type Prefecture } from '@/lib/schemas/hunting-log';
import { rehydrateLanguage, useLanguage, useSetLanguage } from '@/store';

import { HUNTING_COSTS_STORAGE_KEY, useHuntingCostsStore } from './_store';

const validYen = (value: number) => Number.isInteger(value) && value >= 0 && value <= HUNTING_COSTS_MAX_YEN;

export function HuntingCostsClient() {
  const store = useHuntingCostsStore();
  const { season, licenses, lowIncome, registrations, others, fees } = store;
  const language = useLanguage();
  const setLanguage = useSetLanguage();
  const storageAvailable = useStorageStatus((status) => status.available);
  const discardedSave = useDiscardedSave(HUNTING_COSTS_STORAGE_KEY);
  const [ready, setReady] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);

  useEffect(() => {
    void Promise.all([useHuntingCostsStore.persist.rehydrate(), rehydrateLanguage()]).then(() => setReady(true));
  }, []);

  const yen = (value: number) =>
    Number.isFinite(value) ? `${new Intl.NumberFormat(language).format(value)}${t(' 円', ' yen')}` : '—';
  const licenseName = (type: LicenseType) => LICENSE_NAMES[type][language];
  const seasonValid = Number.isInteger(season) && season >= 2015 && season <= 2100;
  const feesValid = Object.values(fees).every(validYen);
  const othersValid = others.every((other) => validYen(other.amount));
  const inputsValid = seasonValid && feesValid && othersValid;
  const result = inputsValid ? calculateHuntingCosts(store) : null;
  const held = new Set(licenses.map((license) => license.type));

  const scenarioName = (scenario: CostScenario) =>
    ({
      first: t('初年度（免許の取得）', 'First year (new licence)'),
      regular: t('通常の年（登録のみ）', 'Usual year (registration only)'),
      renewal: t('更新年（免許の更新）', 'Renewal year'),
    })[scenario];

  const problemText = (problem: CostProblem) => {
    const registration = registrations.find((entry) => entry.id === problem.registrationId);
    const where = registration ? prefectureName(registration.prefecture, language) : '';
    switch (problem.kind) {
      case 'unlicensedType':
        return t(
          `${where}：${licenseName(problem.type)}の免許が選ばれていません。`,
          `${where}: no ${licenseName(problem.type)} licence is selected.`,
        );
      case 'noType':
        return t(`${where}：登録する免許の種類を選んでください。`, `${where}: choose the licences to register.`);
      case 'duplicatePrefecture':
        return t(
          `${where}が 2 回入っています。1 つの都道府県には 1 行で、免許の種類をまとめて選んでください。`,
          `${where} is listed twice. Use one row per prefecture with all its licences.`,
        );
      case 'tax':
        switch (problem.error) {
          case 'reliefExpired':
            return t(
              `${where}：税の特例は令和 11 年 3 月 31 日までに受ける登録が対象です。この登録には適用されません。`,
              `${where}: the tax relief covers registrations up to 31 March 2029 and does not apply to this one.`,
            );
          case 'registeredOnNeeded':
            return t(
              `${where}：税の特例は令和 11 年 3 月 31 日までに受ける登録が対象で、この年度の途中で終わります。登録を受ける日を入力してください。`,
              `${where}: the tax relief ends on 31 March 2029, inside this registration year. Enter the day of registration.`,
            );
          case 'registeredOnOutsideYear':
            return t(
              `${where}：登録を受ける日が、この登録年度（4 月 16 日から翌年 4 月 15 日まで）に入っていません。`,
              `${where}: the day of registration is not in this registration year (16 April to 15 April).`,
            );
          case 'reliefWithReleaseArea':
            return t(
              `${where}：放鳥獣猟区の登録と税の特例を組み合わせた税額は計算しません。登録先の都道府県に確認してください。`,
              `${where}: the tax for a released-game area registration with relief is not worked out here. Ask the prefecture.`,
            );
        }
    }
  };

  const summary = !result
    ? t('入力を確認してください。', 'Check the inputs.')
    : result.problems.length > 0
      ? t('登録の入力に確認が必要な点があります。', 'Some registrations need attention.')
      : t(
          `通常の年は ${yen(result.scenarios.regular.total)}、初年度は ${yen(result.scenarios.first.total)}、更新年は ${yen(result.scenarios.renewal.total)}。`,
          `A usual year costs ${yen(result.scenarios.regular.total)}, the first year ${yen(result.scenarios.first.total)}, a renewal year ${yen(result.scenarios.renewal.total)}.`,
        );

  useEffect(() => {
    if (!ready) return;
    const timer = window.setTimeout(() => setAnnouncement(summary), 700);
    return () => window.clearTimeout(timer);
  }, [ready, summary]);

  const releaseOptions: { value: ReleaseArea; label: string }[] = [
    { value: 'none', label: t('通常', 'Standard') },
    { value: 'releaseOnly', label: t('放鳥獣猟区のみ（税 1/4）', 'Released-game areas only (tax ¼)') },
    {
      value: 'releaseAdded',
      label: t(
        '放鳥獣猟区の登録者が受けるそれ以外の登録（税 3/4）',
        'Added to a released-game area registration (tax ¾)',
      ),
    },
  ];
  const reliefOptions: { value: TaxRelief; label: string }[] = [
    { value: 'none', label: t('なし', 'None') },
    {
      value: 'half',
      label: t('前 1 年以内にこの県で許可捕獲（税 1/2）', 'Captured under permit here in the past year (tax ½)'),
    },
    { value: 'capturer', label: t('鳥獣被害対策実施隊員（非課税）', 'Damage control team member (no tax)') },
    {
      value: 'certified',
      label: t('認定鳥獣捕獲等事業者の従事者（非課税）', 'Worker of a certified capture business (no tax)'),
    },
  ];

  const feeFields: { key: keyof FeeSchedule; ja: string; en: string; basis: string }[] = [
    { key: 'exam', ja: '狩猟免許の申請', en: 'Licence application', basis: '別表 百七 1 ロ' },
    {
      key: 'examPartlyExempt',
      ja: '狩猟免許の申請（試験の一部免除）',
      en: 'Licence application (part of the exam exempted)',
      basis: '別表 百七 1 イ',
    },
    { key: 'renewal', ja: '狩猟免許の更新', en: 'Licence renewal', basis: '別表 百七 3' },
    { key: 'registration', ja: '狩猟者登録（1 件）', en: 'Hunter registration (each)', basis: '別表 百八 1' },
  ];
  const feesAreStandard = feeFields.every(({ key }) => fees[key] === STANDARD_FEES[key]);

  return (
    <AppLayout
      header={
        <AppHeader
          title={labsTool('hunting-costs').title[language]}
          actions={
            <>
              <ResetButton
                language={language}
                description={{
                  ja: '年度・免許・登録・その他の費用・手数料の額を初期値に戻します。',
                  en: 'Resets the year, licences, registrations, other costs and fee amounts.',
                }}
                onReset={store.reset}
              />
              <LanguageMenu language={language} onLanguageChange={setLanguage} />
            </>
          }
        />
      }
    >
      <p className="sr-only" role="status" lang={language}>
        {discardedSave ? discardedSaveMessage(language) : ''}
      </p>
      <p className="sr-only" role="status" lang={language}>
        {announcement}
      </p>
      <div lang={language} className="space-y-6" inert={!ready} aria-busy={!ready}>
        <DiscardedSaveNotice storageKey={HUNTING_COSTS_STORAGE_KEY} language={language} />
        <StorageUnavailableNotice available={storageAvailable} language={language} />
        <ToolLayout
          resultLabel={t('計算結果', 'Results')}
          primary={
            <Card variant="outlined" className="space-y-5 rounded-md p-5 sm:p-6">
              <h2 id="licenses" className="text-xl font-medium">
                {t('免許と年度', 'Licences and year')}
              </h2>
              <NumberField
                label={t('登録年度（開始の年）', 'Registration year (the year it starts)')}
                value={season}
                onChange={store.setSeason}
                step={1}
                invalid={!seasonValid}
                errorText={t('西暦の年を入力してください。', 'Enter a year.')}
                hint={t('4 月 16 日から翌年 4 月 15 日まで', '16 April to 15 April')}
              />
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">
                  {t('持っている（取る）狩猟免許', 'Hunting licences held')}
                </legend>
                {LICENSE_TYPES.map((type) => {
                  const license = licenses.find((entry) => entry.type === type);
                  return (
                    <div key={type} className="flex flex-wrap items-center gap-x-6">
                      <label className="flex min-h-12 cursor-pointer items-center gap-3 text-sm">
                        <input
                          type="checkbox"
                          checked={license !== undefined}
                          onChange={(event) => store.toggleLicense(type, event.target.checked)}
                        />
                        {licenseName(type)}
                      </label>
                      {license && (
                        <label className="flex min-h-12 cursor-pointer items-center gap-3 text-sm text-on-surface-variant">
                          <input
                            type="checkbox"
                            checked={license.partlyExempt}
                            onChange={(event) => store.setPartlyExempt(type, event.target.checked)}
                          />
                          {t('初年度は試験の一部免除', 'Part of the exam exempted in the first year')}
                        </label>
                      )}
                    </div>
                  );
                })}
                <p className="text-xs text-on-surface-variant">
                  {t(
                    '一部免除：既に持っている免許の有効期間内に、別の種類の試験を受ける場合（鳥獣保護管理法 第 49 条第 1 号）。',
                    'Exemption: sitting the exam for another kind while a licence is valid (Wildlife Act art. 49(1)).',
                  )}
                </p>
              </fieldset>
              <label className="flex cursor-pointer items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={lowIncome}
                  onChange={(event) => store.setLowIncome(event.target.checked)}
                />
                <span>
                  {t(
                    '道府県民税の所得割を納めなくてよい（同一生計配偶者・扶養親族に当たらない。農林水産業に従事する場合は当たってもよい）',
                    'No prefectural income levy is due, and you are not a dependent spouse or relative (or you work in farming, fishing or forestry)',
                  )}
                  <span className="block text-xs text-on-surface-variant">
                    {t(
                      '第一種銃猟は 11,000 円、網猟・わな猟は 5,500 円になります（地方税法 第 700 条の 52 第 1 項第 2 号・第 4 号）。',
                      'Class 1 gun becomes 11,000 yen, net and trap 5,500 yen (Local Tax Act art. 700-52(1)(ii), (iv)).',
                    )}
                  </span>
                </span>
              </label>
            </Card>
          }
          secondary={
            <>
              <Card variant="outlined" className="space-y-5 rounded-md p-5 sm:p-6">
                <div className="space-y-2">
                  <h2 id="registrations" className="text-xl font-medium">
                    {t('狩猟者登録', 'Hunter registrations')}
                  </h2>
                  <p className="text-sm text-on-surface-variant">
                    {t(
                      '都道府県ごと・免許の種類ごとに、手数料と狩猟税がかかります。',
                      'The fee and the tax are paid per prefecture and per licence.',
                    )}
                  </p>
                </div>
                {registrations.map((registration, index) => (
                  <fieldset key={registration.id} className="space-y-4 rounded-sm border border-outline-variant p-4">
                    <legend className="px-1 text-sm font-medium">
                      {t(`登録 ${index + 1}`, `Registration ${index + 1}`)}
                    </legend>
                    <SelectField
                      label={t('都道府県', 'Prefecture')}
                      value={registration.prefecture}
                      onChange={(value) =>
                        store.updateRegistration(registration.id, { prefecture: value as Prefecture })
                      }
                      options={PREFECTURES.map((value) => ({ value, label: prefectureName(value, language) }))}
                    />
                    <div className="flex flex-wrap gap-x-6" role="group" aria-label={t('登録する免許', 'Licences')}>
                      {LICENSE_TYPES.filter((type) => held.has(type) || registration.types.includes(type)).map(
                        (type) => (
                          <label key={type} className="flex min-h-12 cursor-pointer items-center gap-3 text-sm">
                            <input
                              type="checkbox"
                              checked={registration.types.includes(type)}
                              onChange={(event) =>
                                store.updateRegistration(registration.id, {
                                  types: event.target.checked
                                    ? LICENSE_TYPES.filter(
                                        (entry) => entry === type || registration.types.includes(entry),
                                      )
                                    : registration.types.filter((entry) => entry !== type),
                                })
                              }
                            />
                            {licenseName(type)}
                          </label>
                        ),
                      )}
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <SelectField
                        label={t('登録の区域', 'Area')}
                        value={registration.releaseArea}
                        onChange={(value) => store.updateRegistration(registration.id, { releaseArea: value })}
                        options={releaseOptions}
                      />
                      <SelectField
                        label={t('狩猟税の特例', 'Tax relief')}
                        value={registration.relief}
                        onChange={(value) => store.updateRegistration(registration.id, { relief: value })}
                        options={reliefOptions}
                      />
                    </div>
                    {registration.relief !== 'none' && (
                      <DateField
                        label={t('登録を受ける日', 'Day of registration')}
                        value={registration.registeredOn}
                        onChange={(value) => store.updateRegistration(registration.id, { registeredOn: value })}
                      />
                    )}
                    {(result?.taxLines[registration.id]?.length ?? 0) > 0 && (
                      <p className="text-sm text-on-surface-variant">
                        {(result?.taxLines[registration.id] ?? [])
                          .map((line) => `${licenseName(line.type)} ${t('狩猟税', 'tax')} ${yen(line.tax)}`)
                          .join(' / ')}
                      </p>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => store.removeRegistration(registration.id)}
                      aria-label={t(`登録 ${index + 1} を削除`, `Remove registration ${index + 1}`)}
                    >
                      <LuTrash2 aria-hidden="true" />
                      {t('この登録を削除', 'Remove')}
                    </Button>
                  </fieldset>
                ))}
                {registrations.length < HUNTING_COSTS_MAX_REGISTRATIONS && (
                  <Button type="button" variant="outline" onClick={store.addRegistration}>
                    <LuPlus aria-hidden="true" />
                    {t('都道府県を追加', 'Add a prefecture')}
                  </Button>
                )}
                {reliefPeriod(season) === 'part' && (
                  <p className="text-sm text-on-surface-variant">
                    {t(
                      `税の特例（1/2 軽減・非課税）は ${TAX_RELIEF_LAST_DAY} までの登録が対象で、この年度の途中で終わります。特例を選んだ登録には、登録を受ける日を入力してください。`,
                      `The tax relief (half or none) covers registrations up to ${TAX_RELIEF_LAST_DAY}, inside this year. Enter the day of registration for each registration with relief.`,
                    )}
                  </p>
                )}
                {reliefPeriod(season) === 'none' && (
                  <p className="text-sm text-on-surface-variant">
                    {t(
                      `税の特例（1/2 軽減・非課税）は ${TAX_RELIEF_LAST_DAY} までに受ける登録が対象で、この年度には使えません。`,
                      `The tax relief (half or none) covers registrations up to ${TAX_RELIEF_LAST_DAY} and not this year.`,
                    )}
                  </p>
                )}
              </Card>
              <Card variant="outlined" className="space-y-5 rounded-md p-5 sm:p-6">
                <div className="space-y-2">
                  <h2 id="others" className="text-xl font-medium">
                    {t('猟友会費・保険など', 'Club dues, insurance and other costs')}
                  </h2>
                  <p className="text-sm text-on-surface-variant">
                    {t(
                      '猟友会費やハンター保険（共済）など、毎年かかる費用。',
                      'Yearly costs such as club dues and hunter insurance.',
                    )}
                  </p>
                </div>
                {others.map((other, index) => (
                  <div key={other.id} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-end gap-3">
                    <div className="min-w-0 space-y-2">
                      <label htmlFor={`other-${other.id}`} className="block text-sm font-medium">
                        {t(`項目 ${index + 1}`, `Item ${index + 1}`)}
                      </label>
                      <input
                        id={`other-${other.id}`}
                        type="text"
                        value={other.label}
                        maxLength={HUNTING_COSTS_MAX_LABEL}
                        placeholder={t('例：猟友会費', 'e.g. club dues')}
                        onChange={(event) => store.updateOther(other.id, { label: event.target.value })}
                      />
                    </div>
                    <NumberField
                      label={t('金額', 'Amount')}
                      unit={t('円', 'yen')}
                      value={other.amount}
                      step={100}
                      min={0}
                      onChange={(value) => store.updateOther(other.id, { amount: value })}
                      invalid={!validYen(other.amount)}
                      errorText={t('0 以上の整数を入力してください。', 'Enter a whole number, 0 or more.')}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => store.removeOther(other.id)}
                      aria-label={t(`項目 ${index + 1} を削除`, `Remove item ${index + 1}`)}
                    >
                      <LuTrash2 aria-hidden="true" />
                    </Button>
                  </div>
                ))}
                {others.length < HUNTING_COSTS_MAX_OTHER && (
                  <Button type="button" variant="outline" onClick={store.addOther}>
                    <LuPlus aria-hidden="true" />
                    {t('項目を追加', 'Add an item')}
                  </Button>
                )}
              </Card>
            </>
          }
          result={
            <Card variant="outlined" className="min-w-0 space-y-5 rounded-md p-5 sm:p-6">
              <h2 id="result" className="text-xl font-medium">
                {t('1 年にかかる費用', 'Cost per year')}
              </h2>
              <ResultPanel>
                {COST_SCENARIOS.map((scenario) => (
                  <ResultFigure
                    key={scenario}
                    size={scenario === 'regular' ? 'lead' : 'normal'}
                    label={scenarioName(scenario)}
                    value={result ? yen(result.scenarios[scenario].total) : '—'}
                  />
                ))}
              </ResultPanel>
              {result && (
                <table className="w-full text-sm">
                  <caption className="sr-only">{t('内訳', 'Breakdown')}</caption>
                  <thead>
                    <tr className="text-left text-on-surface-variant">
                      <th scope="col" className="py-1 font-normal">
                        {t('内訳', 'Item')}
                      </th>
                      {COST_SCENARIOS.map((scenario) => (
                        <th key={scenario} scope="col" className="py-1 text-right font-normal">
                          {
                            {
                              first: t('初年度', 'First'),
                              regular: t('通常', 'Usual'),
                              renewal: t('更新年', 'Renewal'),
                            }[scenario]
                          }
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant tabular-nums">
                    {(
                      [
                        ['licenseFees', t('免許の手数料', 'Licence fees')],
                        ['registrationFees', t('登録手数料', 'Registration fees')],
                        ['tax', t('狩猟税', 'Hunting tax')],
                        ['others', t('その他', 'Other')],
                      ] as const
                    ).map(([key, label]) => (
                      <tr key={key}>
                        <th scope="row" className="py-2 text-left font-normal">
                          {label}
                        </th>
                        {COST_SCENARIOS.map((scenario) => (
                          <td key={scenario} className="py-2 text-right">
                            {yen(result.scenarios[scenario][key])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {result && result.problems.length > 0 && (
                <div role="alert" className="rounded-sm bg-error-container p-4 text-sm text-on-error-container">
                  <ul className="list-disc space-y-1 pl-5">
                    {result.problems.map((problem, index) => (
                      <li key={index}>{problemText(problem)}</li>
                    ))}
                  </ul>
                </div>
              )}
              <p className="text-xs text-on-surface-variant">
                {t(
                  '診断書・写真・講習の費用と、銃の所持許可の手数料は含みません。',
                  'Doctor’s certificates, photos, courses and firearms permit fees are not included.',
                )}
              </p>
            </Card>
          }
          extras={
            <>
              <ConditionSection
                id="fees"
                title={t('手数料の額', 'Fee amounts')}
                summary={
                  feesAreStandard
                    ? t('国の標準額（手数料の標準に関する政令）', 'National standard (Cabinet Order on standard fees)')
                    : t('入力した額を使用中', 'Using the amounts entered')
                }
                forceOpen={!feesValid}
              >
                <p className="text-sm text-on-surface-variant">
                  {t(
                    '手数料は都道府県の条例で定められます。登録先の案内と違う場合は、その額に書き換えてください。',
                    'Fees are set by prefectural ordinance. If your prefecture’s guidance differs, enter its amounts.',
                  )}
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  {feeFields.map(({ key, ja, en, basis }) => (
                    <NumberField
                      key={key}
                      label={t(ja, en)}
                      unit={t('円', 'yen')}
                      value={fees[key]}
                      step={100}
                      min={0}
                      onChange={(value) => store.setFee(key, value)}
                      invalid={!validYen(fees[key])}
                      errorText={t('0 以上の整数を入力してください。', 'Enter a whole number, 0 or more.')}
                      hint={t(
                        `標準額 ${yen(STANDARD_FEES[key])}（${basis}）`,
                        `Standard ${yen(STANDARD_FEES[key])} (${basis})`,
                      )}
                    />
                  ))}
                </div>
                {!feesAreStandard && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => feeFields.forEach(({ key }) => store.setFee(key, STANDARD_FEES[key]))}
                  >
                    {t('標準額に戻す', 'Back to the standard amounts')}
                  </Button>
                )}
              </ConditionSection>
              <ConditionSection
                id="sources"
                title={t('計算方法と出典', 'Method and sources')}
                summary={t(
                  `e-Gov 法令検索（確認日 ${COSTS_CHECKED_ON}）`,
                  `e-Gov law search (checked ${COSTS_CHECKED_ON})`,
                )}
              >
                <ul className="list-disc space-y-2 pl-5 text-sm">
                  <li>
                    {t(
                      `狩猟税（地方税法 第 700 条の 52 第 1 項）：第一種銃猟 ${yen(HUNTING_TAX.firstGun.full)}（所得割を納めない者 ${yen(HUNTING_TAX.firstGun.reduced)}）、網猟・わな猟 ${yen(HUNTING_TAX.net.full)}（同 ${yen(HUNTING_TAX.net.reduced)}）、第二種銃猟 ${yen(HUNTING_TAX.secondGun.full)}。`,
                      `Hunting tax (Local Tax Act art. 700-52(1)): Class 1 gun ${yen(HUNTING_TAX.firstGun.full)} (${yen(HUNTING_TAX.firstGun.reduced)} without income levy), net and trap ${yen(HUNTING_TAX.net.full)} (${yen(HUNTING_TAX.net.reduced)}), Class 2 gun ${yen(HUNTING_TAX.secondGun.full)}.`,
                    )}
                  </li>
                  <li>
                    {t(
                      '放鳥獣猟区のみの登録は 1/4、放鳥獣猟区の登録を受けている者のそれ以外を含む登録は 3/4（同条第 2 項）。',
                      'A registration for released-game areas only pays ¼; one added to it for other areas pays ¾ (para. 2).',
                    )}
                  </li>
                  <li>
                    {t(
                      `対象鳥獣捕獲員（実施隊員）と認定鳥獣捕獲等事業者の従事者は非課税（附則 第 32 条）。申請書の提出前 1 年以内にその県で許可捕獲等をした者は 1/2（附則 第 32 条の 2。直近の猟期について既に登録を受けた場合を除く）。いずれも ${TAX_RELIEF_LAST_DAY} までに受ける登録が対象。`,
                      `Damage control team members and workers of certified capture businesses pay no tax (Supplementary art. 32). Those who captured under permit in the prefecture within a year before applying pay half (art. 32-2, unless already registered for the latest season). Both cover registrations up to ${TAX_RELIEF_LAST_DAY}.`,
                    )}
                  </li>
                  <li>
                    {t(
                      '手数料の標準（地方公共団体の手数料の標準に関する政令 別表 百七・百八）：狩猟免許の申請 5,200 円（試験の一部免除を受ける者 3,900 円）、更新 2,900 円、狩猟者登録 1,800 円。',
                      'Standard fees (Cabinet Order on standard local government fees, table items 107 and 108): licence application 5,200 yen (3,900 yen with part of the exam exempted), renewal 2,900 yen, registration 1,800 yen.',
                    )}
                  </li>
                </ul>
                <p className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
                  <a href={COST_SOURCES.localTaxAct} target="_blank" rel="noreferrer">
                    {t('地方税法（e-Gov）', 'Local Tax Act (e-Gov)')}
                  </a>
                  <a href={COST_SOURCES.feeOrder} target="_blank" rel="noreferrer">
                    {t('手数料の標準に関する政令（e-Gov）', 'Cabinet Order on standard fees (e-Gov)')}
                  </a>
                  <a href={COST_SOURCES.wildlifeAct} target="_blank" rel="noreferrer">
                    {t('鳥獣保護管理法（e-Gov）', 'Wildlife Act (e-Gov)')}
                  </a>
                </p>
                <p className="text-sm text-on-surface-variant">
                  {t(
                    '税の特例を受けるには、登録の申請の際に証明書類が必要です。',
                    'The tax relief needs supporting documents with the registration application.',
                  )}
                </p>
              </ConditionSection>
            </>
          }
        />
      </div>
    </AppLayout>
  );
}
