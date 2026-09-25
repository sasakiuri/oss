'use client';

import { useEffect, useState } from 'react';

import {
  AppHeader,
  AppLayout,
  DiscardedSaveNotice,
  LanguageMenu,
  NumberField,
  ResetButton,
  SelectField,
  StorageUnavailableNotice,
  ToolLayout,
  discardedSaveMessage,
} from '@/components/labs';
import { Card } from '@/components/ui';
import { useDiscardedSave, useStorageStatus } from '@/lib/browser-storage';
import { labsTool } from '@/lib/labs-tools';
import { UNIT_QUANTITY_IDS, convertUnit, unitsOf, valueAllowed, type UnitQuantity } from '@/lib/unit-converter';
import { rehydrateLanguage, useLanguage, useSetLanguage } from '@/store';

import { initialUnitConverterSettings, storageKey, useUnitConverterStore } from './_store';

type Text = { ja: string; en: string };

const QUANTITY_NAMES: Record<UnitQuantity, Text> = {
  pressure: { ja: '圧力（充填圧）', en: 'Pressure (fill pressure)' },
  torque: { ja: 'トルク（締付け）', en: 'Torque' },
  velocity: { ja: '速度', en: 'Velocity' },
  mass: { ja: '重さ', en: 'Weight' },
  energy: { ja: 'エネルギー', en: 'Energy' },
  length: { ja: '長さ', en: 'Length' },
  angle: { ja: '角度', en: 'Angle' },
};

const UNIT_NAMES: Record<string, Text> = {
  bar: { ja: 'bar', en: 'bar' },
  mpa: { ja: 'MPa', en: 'MPa' },
  psi: { ja: 'psi', en: 'psi' },
  'kgf-cm2': { ja: 'kgf/cm²', en: 'kgf/cm²' },
  atm: { ja: 'atm（標準気圧）', en: 'atm (standard)' },
  nm: { ja: 'N·m', en: 'N·m' },
  'kgf-cm': { ja: 'kgf·cm', en: 'kgf·cm' },
  'in-lb': { ja: 'in-lb', en: 'in-lb' },
  'ft-lb': { ja: 'ft-lb', en: 'ft-lb' },
  mps: { ja: 'm/s', en: 'm/s' },
  kmh: { ja: 'km/h', en: 'km/h' },
  fps: { ja: 'fps', en: 'fps' },
  mph: { ja: 'mph', en: 'mph' },
  g: { ja: 'g', en: 'g' },
  kg: { ja: 'kg', en: 'kg' },
  grain: { ja: 'grain', en: 'grain' },
  oz: { ja: 'oz', en: 'oz' },
  lb: { ja: 'lb', en: 'lb' },
  j: { ja: 'J', en: 'J' },
  'kgf-m': { ja: 'kgf·m', en: 'kgf·m' },
  mm: { ja: 'mm', en: 'mm' },
  cm: { ja: 'cm', en: 'cm' },
  m: { ja: 'm', en: 'm' },
  inch: { ja: 'inch', en: 'inch' },
  ft: { ja: 'ft', en: 'ft' },
  yd: { ja: 'yd', en: 'yd' },
  moa: { ja: 'MOA', en: 'MOA' },
  mil: { ja: 'mil（ミリラジアン）', en: 'mil (milliradian)' },
  deg: { ja: '度', en: 'degrees' },
  'cm-100m': { ja: 'cm（100 m で）', en: 'cm at 100 m' },
  iphy: { ja: 'inch（100 yd で、IPHY）', en: 'inch at 100 yd (IPHY)' },
};

/** Enough digits for a torque wrench or a gauge, and no more than the definitions carry. */
const SIGNIFICANT_DIGITS = 6;

export function UnitConverterClient() {
  const { quantity, entries, setQuantity, setEntry } = useUnitConverterStore();
  const language = useLanguage();
  const setLanguage = useSetLanguage();
  const storageAvailable = useStorageStatus((status) => status.available);
  const discardedSave = useDiscardedSave(storageKey);
  const [ready, setReady] = useState(false);
  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);
  const name = (text: Text) => text[language];

  useEffect(() => {
    void Promise.all([useUnitConverterStore.persist.rehydrate(), rehydrateLanguage()]).then(() => setReady(true));
  }, []);

  const entry = entries[quantity];
  const invalid = !valueAllowed(quantity, entry.value, entry.unit);
  const format = (value: number) =>
    Number.isFinite(value)
      ? new Intl.NumberFormat(language, { maximumSignificantDigits: SIGNIFICANT_DIGITS }).format(value)
      : '—';
  const unitLabel = (unit: string) => (UNIT_NAMES[unit] ? name(UNIT_NAMES[unit]) : unit);
  const rows = unitsOf(quantity).map((unit) => ({
    unit,
    value: invalid ? NaN : convertUnit(quantity, entry.value, entry.unit, unit),
  }));

  return (
    <AppLayout
      header={
        <AppHeader
          title={labsTool('unit-converter').title[language]}
          actions={
            <>
              <ResetButton
                language={language}
                description={{ ja: 'すべての値を初期値に戻します。', en: 'Resets every value.' }}
                onReset={() =>
                  useUnitConverterStore.setState({
                    ...initialUnitConverterSettings,
                    lastValidSettings: initialUnitConverterSettings,
                  })
                }
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
      <div lang={language} className="space-y-6" inert={!ready} aria-busy={!ready}>
        <DiscardedSaveNotice storageKey={storageKey} language={language} />
        <StorageUnavailableNotice available={storageAvailable} language={language} />
        <ToolLayout
          resultLabel={t('換算結果', 'Conversions')}
          primary={
            <Card variant="outlined" className="space-y-5 rounded-md p-5 sm:p-6">
              <h2 id="value" className="text-xl font-medium">
                {t('換算する値', 'Value to convert')}
              </h2>
              <SelectField
                label={t('量の種類', 'Quantity')}
                value={quantity}
                onChange={(value) => setQuantity(value as UnitQuantity)}
                options={UNIT_QUANTITY_IDS.map((id) => ({ value: id, label: name(QUANTITY_NAMES[id]) }))}
              />
              <NumberField
                label={t('値', 'Value')}
                value={entry.value}
                onChange={(value) => setEntry(quantity, { ...entry, value })}
                units={{
                  value: entry.unit,
                  label: t('値の単位', 'Unit of the value'),
                  options: unitsOf(quantity).map((unit) => ({ value: unit, label: unitLabel(unit) })),
                  onChange: (unit: string) => setEntry(quantity, { ...entry, unit }),
                }}
                invalid={invalid}
                errorText={
                  quantity === 'angle'
                    ? t('90 度未満の角度を入力してください。', 'Enter an angle of less than 90 degrees.')
                    : t('0 以上の数値を入力してください。', 'Enter a number of zero or more.')
                }
              />
            </Card>
          }
          result={
            <Card variant="outlined" className="min-w-0 space-y-4 rounded-md p-5 sm:p-6">
              <h2 id="results" className="text-xl font-medium">
                {name(QUANTITY_NAMES[quantity])}
              </h2>
              <table className="w-full border-collapse text-sm">
                <caption className="sr-only">
                  {t(
                    `${format(entry.value)} ${unitLabel(entry.unit)} の換算`,
                    `${format(entry.value)} ${unitLabel(entry.unit)} converted`,
                  )}
                </caption>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.unit} className="border-t border-outline-variant first:border-t-0">
                      <th scope="row" className="py-2 pr-4 text-left font-normal text-on-surface-variant">
                        {unitLabel(row.unit)}
                      </th>
                      <td
                        className={`py-2 text-right text-lg tabular-nums ${row.unit === entry.unit ? 'font-medium' : ''}`}
                      >
                        {format(row.value)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          }
          extras={
            <Card variant="outlined" className="min-w-0 space-y-3 rounded-md p-5 sm:p-6 lg:col-span-2">
              <h2 id="notes" className="text-xl font-medium">
                {t('換算の定義', 'Definitions')}
              </h2>
              <ul className="space-y-2 text-sm text-on-surface-variant">
                <li>
                  {t(
                    '国際ヤード・ポンド（1 yd = 0.9144 m、1 lb = 0.45359237 kg）、1 grain = 1/7000 lb、標準重力 9.80665 m/s²（kgf・lbf）、1 bar = 100 kPa、1 atm = 101.325 kPa の定義から換算します（NIST SP 811 付録 B.8）。',
                    'Conversions follow from the international yard and pound (0.9144 m, 0.45359237 kg), 1 grain = 1/7000 lb, standard gravity 9.80665 m/s² (kgf, lbf), 1 bar = 100 kPa and 1 atm = 101.325 kPa (NIST SP 811, Appendix B.8).',
                  )}
                </li>
                <li>
                  {t(
                    'MOA は 1/60 度、mil はミリラジアン（1/1000 rad）で、円を 6400 分割する NATO mil とは別の単位です。',
                    'MOA is 1/60 of a degree and mil is the milliradian (1/1000 rad), a different unit from the NATO mil of 1/6400 of a circle.',
                  )}
                </li>
              </ul>
            </Card>
          }
        />
      </div>
    </AppLayout>
  );
}
