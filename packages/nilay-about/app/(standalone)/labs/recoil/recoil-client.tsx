'use client';

import { useEffect, useState } from 'react';

import {
  AppHeader,
  AppLayout,
  ConditionPair,
  ConditionSection,
  DiscardedSaveNotice,
  LanguageMenu,
  NumberField,
  ResetButton,
  StorageUnavailableNotice,
  ResultFigure,
  ResultPanel,
  SectionNav,
  SelectField,
  ToolLayout,
  discardedSaveMessage,
} from '@/components/labs';
import { Button, Card } from '@/components/ui';
import { useDiscardedSave, useStorageStatus } from '@/lib/browser-storage';
import { labsTool } from '@/lib/labs-tools';
import {
  GAS_VELOCITY_FACTORS,
  calculateRecoil,
  chargeFromKilograms,
  compareRecoil,
  fromKilograms,
  fromMetersPerSecond,
  type FirearmType,
  type LoadId,
  type RecoilCaution,
  type RecoilCautionKey,
  type RecoilLoad,
  type RecoilResult,
} from '@/lib/recoil';
import { rehydrateLanguage, useLanguage, useSetLanguage } from '@/store';

import { initialRecoilSettings, storageKey, useRecoilStore } from './_store';

export function RecoilClient() {
  const {
    gunMassUnit,
    chargeMassUnit,
    velocityUnit,
    a,
    b,
    setGunMassUnit,
    setChargeMassUnit,
    setVelocityUnit,
    setLoad,
    copyLoad,
  } = useRecoilStore();
  const language = useLanguage();
  const setLanguage = useSetLanguage();
  const storageAvailable = useStorageStatus((status) => status.available);
  const discardedSave = useDiscardedSave(storageKey);
  const [ready, setReady] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);

  useEffect(() => {
    void Promise.all([useRecoilStore.persist.rehydrate(), rehydrateLanguage()]).then(() => setReady(true));
  }, []);

  const units = { gunMassUnit, chargeMassUnit, velocityUnit };
  const resultA = calculateRecoil(a, units);
  const resultB = calculateRecoil(b, units);
  const comparison = compareRecoil(resultA, resultB);

  const number = (value: number, digits = 2) =>
    Number.isFinite(value) ? new Intl.NumberFormat(language, { maximumFractionDigits: digits }).format(value) : '—';
  const signedPercent = (value: number) =>
    Number.isFinite(value)
      ? `${new Intl.NumberFormat(language, { maximumFractionDigits: 1, signDisplay: 'exceptZero' }).format(value)}%`
      : '—';

  // A charge in grains is a coarser unit than a charge in grams, so it needs one decimal fewer.
  const chargeDigits = chargeMassUnit === 'g' ? 2 : 1;
  const positiveError = t('0 より大きい数値を入力してください。', 'Enter a number greater than zero.');
  const nonNegativeError = t('0 以上の数値を入力してください。', 'Enter a number of zero or more.');

  const massPair = (kilograms: number) =>
    `${number(chargeFromKilograms(kilograms, 'g'))} g / ${number(chargeFromKilograms(kilograms, 'grain'), 1)} grain`;
  const speedPair = (metersPerSecond: number) =>
    `${number(metersPerSecond, 1)} m/s / ${number(fromMetersPerSecond(metersPerSecond, 'fps'), 0)} fps`;
  const recoilSpeed = (metersPerSecond: number) => {
    const fps = `${number(fromMetersPerSecond(metersPerSecond, 'fps'), 1)} fps`;
    return t(`${number(metersPerSecond)} m/s（${fps}）`, `${number(metersPerSecond)} m/s (${fps})`);
  };

  const firearmTypeOptions = (
    [
      ['rifle', t('ライフル（高威力）', 'High-powered rifle')],
      ['shotgun-average', t('散弾銃（標準的な銃身長）', 'Shotgun, average barrel')],
      ['shotgun-long', t('散弾銃（長銃身）', 'Shotgun, long barrel')],
      ['handgun', t('拳銃・回転式拳銃', 'Pistol or revolver')],
    ] as [FirearmType, string][]
  ).map(([value, label]) => ({ value, label: `${label} ×${GAS_VELOCITY_FACTORS[value].toFixed(2)}` }));

  const cautionName = (key: RecoilCautionKey) =>
    ({
      gunMass: t('銃の重量', 'gun weight'),
      ejectaMass: t('射出質量', 'ejecta weight'),
      powderMass: t('装薬量', 'powder charge'),
      velocity: t('初速', 'muzzle velocity'),
    })[key];
  const cautionLimit = (caution: RecoilCaution) => {
    if (caution.key === 'gunMass') return `${number(fromKilograms(caution.limit, gunMassUnit))} ${gunMassUnit}`;
    if (caution.key === 'velocity')
      return `${number(fromMetersPerSecond(caution.limit, velocityUnit), 0)} ${velocityUnit}`;
    return `${number(chargeFromKilograms(caution.limit, chargeMassUnit), chargeDigits)} ${chargeMassUnit}`;
  };
  const cautionText = (caution: RecoilCaution) =>
    t(
      `${cautionName(caution.key)}が ${cautionLimit(caution)} ${caution.bound === 'below' ? '未満' : '超'}`,
      `${cautionName(caution.key)} ${caution.bound === 'below' ? 'below' : 'above'} ${cautionLimit(caution)}`,
    );

  const difference = comparison
    ? Math.abs(comparison.energyPercent) < 0.05
      ? t(
          '条件 A と条件 B の自由反動エネルギーは、ほぼ同じです。',
          'Conditions A and B give almost the same free recoil energy.',
        )
      : t(
          `条件 B の自由反動エネルギーは、条件 A より ${number(Math.abs(comparison.energyPercent), 1)}% ${comparison.energyPercent > 0 ? '大きく' : '小さく'}なります。`,
          `Condition B gives ${number(Math.abs(comparison.energyPercent), 1)}% ${comparison.energyPercent > 0 ? 'more' : 'less'} free recoil energy than condition A.`,
        )
    : t('両方の条件に銃と装弾の値を入力してください。', 'Enter the gun and load for both conditions.');

  const summary =
    resultA && resultB
      ? t(
          `条件 A は ${number(resultA.energyJoules)} J、条件 B は ${number(resultB.energyJoules)} J。${difference}`,
          `Condition A: ${number(resultA.energyJoules)} J, condition B: ${number(resultB.energyJoules)} J. ${difference}`,
        )
      : difference;

  useEffect(() => {
    // Announce once typing settles, not on every keystroke.
    if (!ready) return;
    const timer = window.setTimeout(() => setAnnouncement(summary), 700);
    return () => window.clearTimeout(timer);
  }, [ready, summary]);

  // Intermediate values, for checking against other sources.
  const workingRows: { key: string; label: string; value: (result: RecoilResult) => string }[] = [
    {
      key: 'ejecta',
      label: t('射出質量（発射物 + ワッズ）', 'Ejecta (projectile and wad)'),
      value: (result) => massPair(result.ejectaMassKg),
    },
    {
      key: 'gas',
      label: t('発射ガスの実効速度', 'Effective propellant gas velocity'),
      value: (result) =>
        t(
          `${speedPair(result.gasVelocityMs)}（係数 ×${result.gasFactor.toFixed(2)}）`,
          `${speedPair(result.gasVelocityMs)} (factor ×${result.gasFactor.toFixed(2)})`,
        ),
    },
    {
      key: 'momentum',
      label: t('反動運動量', 'Recoil momentum'),
      value: (result) => `${number(result.momentumKgMs)} kg·m/s / ${number(result.momentumLbFts)} lb·ft/s`,
    },
  ];

  // Break between the two units, never inside one ("ft-lb" would break at the hyphen).
  const pair = (text: string) =>
    text.split(' / ').map((part, index) => (
      <span key={index}>
        {index > 0 && ' / '}
        <span className="whitespace-nowrap">{part}</span>
      </span>
    ));

  const comparisonTable = (
    caption: string,
    rows: { key: string; label: string; value: (result: RecoilResult) => string }[],
  ) => (
    <table className="w-full text-sm">
      <caption className="sr-only">{caption}</caption>
      <thead>
        <tr>
          <th scope="col" className="py-2 pr-2 text-left font-medium">
            {t('項目', 'Quantity')}
          </th>
          <th scope="col" className="py-2 pl-2 text-right font-medium">
            {t('条件 A', 'Condition A')}
          </th>
          <th scope="col" className="py-2 pl-2 text-right font-medium">
            {t('条件 B', 'Condition B')}
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.key} className="border-t border-outline-variant align-top">
            <th scope="row" className="py-2 pr-2 text-left font-normal">
              {row.label}
            </th>
            <td className="py-2 pl-2 text-right tabular-nums">{resultA ? pair(row.value(resultA)) : '—'}</td>
            <td className="py-2 pl-2 text-right tabular-nums">{resultB ? pair(row.value(resultB)) : '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  // Units are shared by A and B and offered in every field that uses them.
  const gunMassUnits = {
    value: gunMassUnit,
    label: t('銃の重量の単位', 'Gun weight unit'),
    options: [
      { value: 'kg', label: 'kg' },
      { value: 'lb', label: 'lb' },
    ],
    onChange: setGunMassUnit,
  } as const;
  const chargeMassUnits = {
    value: chargeMassUnit,
    label: t('装弾の重量の単位', 'Load weight unit'),
    options: [
      { value: 'g', label: 'g' },
      { value: 'grain', label: 'grain' },
    ],
    onChange: setChargeMassUnit,
  } as const;
  const velocityUnits = {
    value: velocityUnit,
    label: t('初速の単位', 'Velocity unit'),
    options: [
      { value: 'm/s', label: 'm/s' },
      { value: 'fps', label: 'fps' },
    ],
    onChange: setVelocityUnit,
  } as const;

  // Flags a card with errors or cautions, for the phone view that shows one card at a time.
  const needsAttention = (load: RecoilLoad, result: RecoilResult | null) =>
    !(load.gunMass > 0) ||
    !(load.velocity > 0) ||
    !(load.projectileMass > 0) ||
    !(load.wadMass >= 0) ||
    !(load.powderMass >= 0) ||
    (result?.cautions.length ?? 0) > 0;

  const loadCard = (id: LoadId, load: RecoilLoad, result: RecoilResult | null) => {
    const isBaseline = id === 'a';
    const change = (changes: Partial<RecoilLoad>) => setLoad(id, changes);
    // Hints are shown on A only.
    const hint = (text: string) => (isBaseline ? text : undefined);
    return (
      <Card variant="outlined" className="space-y-5 rounded-md p-5 sm:p-6">
        <h2 id={isBaseline ? 'condition-a' : 'condition-b'} className="text-xl font-medium">
          {isBaseline ? t('条件 A', 'Condition A') : t('条件 B', 'Condition B')}
        </h2>
        {/* A fieldset keeps its own min-content width, so the grid lives inside it rather than on it. */}
        <fieldset className="min-w-0">
          <legend className="sr-only">
            {isBaseline ? t('条件 A の入力', 'Condition A inputs') : t('条件 B の入力', 'Condition B inputs')}
          </legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              label={t('銃種', 'Firearm type')}
              value={load.firearmType}
              onChange={(firearmType: FirearmType) => change({ firearmType })}
              options={firearmTypeOptions}
              // Full width so the factor is not cut off. First, because it sets the gas factor and whether there is a wad.
              className="sm:col-span-2"
            />
            <NumberField
              label={t('銃の重量', 'Gun weight')}
              units={gunMassUnits}
              hint={hint(t('スコープ・付属品込み', 'With scope and accessories'))}
              value={load.gunMass}
              onChange={(gunMass) => change({ gunMass })}
              min={0}
              invalid={!Number.isFinite(load.gunMass) || load.gunMass <= 0}
              errorText={positiveError}
            />
            <NumberField
              label={t('初速', 'Muzzle velocity')}
              units={velocityUnits}
              value={load.velocity}
              onChange={(velocity) => change({ velocity })}
              min={0}
              invalid={!Number.isFinite(load.velocity) || load.velocity <= 0}
              errorText={positiveError}
            />
            <NumberField
              label={t('発射物の重量', 'Projectile weight')}
              units={chargeMassUnits}
              hint={hint(t('散弾は鉛量、ライフルは弾頭重量', 'Shot charge for shotshells, bullet weight for rifles'))}
              value={load.projectileMass}
              onChange={(projectileMass) => change({ projectileMass })}
              min={0}
              invalid={!Number.isFinite(load.projectileMass) || load.projectileMass <= 0}
              errorText={positiveError}
            />
            <NumberField
              label={t('ワッズの重量', 'Wad weight')}
              units={chargeMassUnits}
              hint={hint(t('散弾のみ。ない場合は 0', 'Shotshells only; 0 if none'))}
              value={load.wadMass}
              onChange={(wadMass) => change({ wadMass })}
              min={0}
              invalid={!Number.isFinite(load.wadMass) || load.wadMass < 0}
              errorText={nonNegativeError}
            />
            <NumberField
              label={t('装薬量', 'Powder charge')}
              units={chargeMassUnits}
              value={load.powderMass}
              onChange={(powderMass) => change({ powderMass })}
              min={0}
              invalid={!Number.isFinite(load.powderMass) || load.powderMass < 0}
              errorText={nonNegativeError}
            />
          </div>
        </fieldset>
        {result && result.cautions.length > 0 && (
          // A caution, not an error; announced because it can appear without editing that field.
          <p role="status" className="text-sm text-on-surface-variant">
            {t(
              `実在の銃器の範囲から外れた入力があります（${result.cautions.map(cautionText).join('、')}）。単位と桁を確認してください。`,
              `Some input is outside the range of real firearms (${result.cautions.map(cautionText).join(', ')}). Check the units and digits.`,
            )}
          </p>
        )}
        {!result && (
          <p className="text-sm text-destructive">
            {t(
              '銃の重量、発射物の重量、初速を入力してください。',
              'Enter the gun weight, projectile weight and muzzle velocity.',
            )}
          </p>
        )}
        <Button type="button" variant="outline" onClick={() => copyLoad(id)}>
          {isBaseline ? t('条件 A を条件 B にコピー', 'Copy A to B') : t('条件 B を条件 A にコピー', 'Copy B to A')}
        </Button>
      </Card>
    );
  };

  return (
    <AppLayout
      nav={
        <SectionNav
          language={language}
          sections={[
            { id: 'condition-a', label: t('条件 A', 'Condition A') },
            { id: 'condition-b', label: t('条件 B', 'Condition B') },
            { id: 'results', label: t('自由反動', 'Free recoil') },
            { id: 'workings', label: t('計算の内訳', 'Workings') },
            { id: 'method-and-source', label: t('計算方法', 'Method') },
          ]}
        />
      }
      header={
        <AppHeader
          title={labsTool('recoil').title[language]}
          actions={
            <>
              <ResetButton
                language={language}
                description={{
                  ja: '条件 A・B と単位を初期値に戻します。',
                  en: 'Resets both conditions and the units to the defaults.',
                }}
                onReset={() =>
                  useRecoilStore.setState({ ...initialRecoilSettings, lastValidSettings: initialRecoilSettings })
                }
              />
              <LanguageMenu language={language} onLanguageChange={setLanguage} />
            </>
          }
        />
      }
    >
      {/* Mounted empty so the text is announced when it arrives; separate from the result summary. */}
      <p className="sr-only" role="status" lang={language}>
        {discardedSave ? discardedSaveMessage(language) : ''}
      </p>
      <p className="sr-only" role="status" lang={language}>
        {announcement}
      </p>
      <div lang={language} className="space-y-6" inert={!ready} aria-busy={!ready}>
        <DiscardedSaveNotice storageKey={storageKey} language={language} />
        <StorageUnavailableNotice available={storageAvailable} language={language} />
        <ToolLayout
          resultLabel={t('自由反動', 'Free recoil')}
          primary={
            <>
              <ConditionPair
                legend={t('表示する条件', 'Condition shown')}
                attentionLabel={t('確認が必要な入力があります', 'has input to check')}
                first={{
                  id: 'condition-a',
                  label: t('条件 A', 'Condition A'),
                  content: loadCard('a', a, resultA),
                  needsAttention: needsAttention(a, resultA),
                }}
                second={{
                  id: 'condition-b',
                  label: t('条件 B', 'Condition B'),
                  content: loadCard('b', b, resultB),
                  needsAttention: needsAttention(b, resultB),
                }}
              />
            </>
          }
          result={
            <Card variant="outlined" className="min-w-0 space-y-5 rounded-md p-5 sm:p-6">
              <h2 id="results" className="text-xl font-medium">
                {t('自由反動', 'Free recoil')}
              </h2>
              <ResultPanel className="grid-cols-2">
                {(
                  [
                    ['a', resultA],
                    ['b', resultB],
                  ] as const
                ).map(([id, result]) => (
                  <ResultFigure
                    key={id}
                    label={t(
                      `条件 ${id.toUpperCase()} の反動エネルギー`,
                      `Condition ${id.toUpperCase()} recoil energy`,
                    )}
                    value={result ? `${number(result.energyJoules)} J` : '—'}
                    note={
                      result
                        ? t(
                            `${number(result.energyFootPounds)} ft-lb、反動速度 ${recoilSpeed(result.recoilVelocityMs)}`,
                            `${number(result.energyFootPounds)} ft-lb, recoil velocity ${recoilSpeed(result.recoilVelocityMs)}`,
                          )
                        : undefined
                    }
                  />
                ))}
                <div className="col-span-2 border-t border-outline-variant pt-4">
                  <ResultFigure
                    label={t('B の反動エネルギー（A 比）', 'B energy compared with A')}
                    value={comparison ? signedPercent(comparison.energyPercent) : '—'}
                    note={
                      comparison
                        ? t(
                            `反動速度 ${signedPercent(comparison.velocityPercent)}`,
                            `Recoil velocity ${signedPercent(comparison.velocityPercent)}`,
                          )
                        : difference
                    }
                  />
                </div>
              </ResultPanel>
              <p className="text-sm text-on-surface-variant">
                {t(
                  '銃が自由に後退するとした値です。肩で感じる反動は構え方、銃床、作動方式、リコイルパッドで変わります。マズルブレーキやサプレッサー付きには当てはまりません。',
                  'Assumes the gun moves back freely. Felt recoil also depends on stance, stock, action and recoil pad. Does not apply with a muzzle brake or suppressor.',
                )}
              </p>
            </Card>
          }
          extras={
            <>
              <ConditionSection
                id="workings"
                title={t('計算の内訳', 'Workings')}
                summary={t(
                  `反動運動量 A ${resultA ? number(resultA.momentumKgMs) : '—'}・B ${resultB ? number(resultB.momentumKgMs) : '—'} kg·m/s、射出質量と発射ガスの実効速度`,
                  `Recoil momentum A ${resultA ? number(resultA.momentumKgMs) : '—'} · B ${resultB ? number(resultB.momentumKgMs) : '—'} kg·m/s, ejecta and gas velocity`,
                )}
              >
                {/* Scrolls inside the section on a phone; focusable for keyboard scrolling. */}
                <div
                  role="region"
                  aria-label={t('計算の内訳の表', 'Table of workings')}
                  tabIndex={0}
                  className="overflow-auto"
                >
                  <div className="min-w-[32rem]">
                    {comparisonTable(
                      t('条件 A と条件 B の計算の内訳', 'Workings for condition A and condition B'),
                      workingRows,
                    )}
                  </div>
                </div>
              </ConditionSection>

              <ConditionSection
                id="method-and-source"
                title={t('計算方法と出典', 'Method and source')}
                summary={t('SAAMI の係数を使った運動量保存の計算', 'Conservation of momentum with SAAMI gas factors')}
              >
                <p className="text-sm text-on-surface-variant">
                  {t(
                    '発射物・ワッズ・発射ガスが前へ持ち去る運動量と同じ運動量で、銃が後ろへ動くとします。',
                    'The gun moves back with the same momentum that the projectile, wad and propellant gas carry forward.',
                  )}
                </p>
                <ul className="space-y-2 text-sm text-on-surface-variant">
                  <li>
                    {t(
                      '反動運動量 =（射出質量 + 係数 × 装薬量）× 初速',
                      'Recoil momentum = (ejecta weight + factor × powder charge) × muzzle velocity',
                    )}
                  </li>
                  <li>
                    {t('自由反動速度 = 反動運動量 ÷ 銃の重量', 'Free recoil velocity = recoil momentum ÷ gun weight')}
                  </li>
                  <li>
                    {t(
                      '自由反動エネルギー = ½ × 銃の重量 × 自由反動速度²',
                      'Free recoil energy = ½ × gun weight × free recoil velocity²',
                    )}
                  </li>
                </ul>
                <p className="text-sm text-on-surface-variant">
                  {t(
                    '発射ガスの実効速度 = 初速 × 係数。係数は SAAMI「Gun Recoil - Technical: Free Recoil Energy」（Rev. 7/9/2018）の値で、高威力ライフル 1.75、標準的な銃身長の散弾銃 1.50、長銃身の散弾銃 1.25、拳銃・回転式拳銃 1.50。元は 1929 年の British Text Book of Small Arms の実験です。',
                    'Effective gas velocity = muzzle velocity × factor. The factors are from SAAMI, "Gun Recoil - Technical: Free Recoil Energy" (Rev. 7/9/2018): 1.75 for high-powered rifles, 1.50 for average-length shotguns, 1.25 for long-barrelled shotguns and 1.50 for pistols and revolvers. They come from experiments in the British Text Book of Small Arms (1929).',
                  )}
                </p>
                <p className="text-sm text-on-surface-variant">
                  {t(
                    'ガス速度を 4000 fps や 4700 fps の定数とする計算法では、同じ装弾でも値が変わります。',
                    'Methods that take the gas velocity as a constant 4000 or 4700 fps give different figures for the same load.',
                  )}
                </p>
                <p className="text-xs text-on-surface-variant">
                  {t(
                    '発射ガスの質量は装薬量と同じとします（SAAMI と同じ）。',
                    'Gas weight equals the powder charge, as in SAAMI.',
                  )}
                </p>
                <p className="text-xs text-on-surface-variant">
                  {t(
                    '1 grain = 64.79891 mg、1 lb = 0.45359237 kg、1 ft = 0.3048 m。',
                    '1 grain = 64.79891 mg, 1 lb = 0.45359237 kg, 1 ft = 0.3048 m.',
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
