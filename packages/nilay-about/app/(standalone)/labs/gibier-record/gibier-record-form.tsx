'use client';

import { useId, type ReactNode } from 'react';

import { SegmentedControl } from '@/components/labs';
import { Card } from '@/components/ui';
import {
  GIBIER_ABNORMALITIES,
  GIBIER_DISINFECTION_LABELS,
  GIBIER_HIT_SITE_LABELS,
  GIBIER_METHOD_LABELS,
  GIBIER_SNARE_SITE_LABELS,
  GIBIER_SPECIES_LABELS,
  isInvalidGibierNumber,
} from '@/lib/gibier-record';
import {
  GIBIER_ABNORMALITY_KEYS,
  GIBIER_DISINFECTIONS,
  GIBIER_HIT_SITES,
  GIBIER_MAX_LONG_TEXT,
  GIBIER_MAX_NUMBER_TEXT,
  GIBIER_MAX_SHORT_TEXT,
  GIBIER_SNARE_SITES,
  type GibierRecord,
  type GibierYesNo,
} from '@/lib/schemas/gibier-record';
import { cn } from '@/lib/utils';

import { useGibierRecordStore } from './_store';
import { GibierLocationField, GibierPhotoField } from './gibier-record-media';

const fieldId = (key: string) => `gibier-${key}`;

/** Marks an item the guideline asks for (第 3（6）) that has no box on 様式 2. */
const EXTRA = ' ※';

/** The shared field style covers text and number inputs only. */
const boxClass = 'min-h-12 w-full rounded-lg border border-outline bg-background p-3';

interface TextFieldProps {
  name: keyof GibierRecord;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: 'text' | 'datetime-local' | 'time';
  /** A number is typed as text, so a half-typed value is kept exactly as it stands. */
  numeric?: boolean;
  unit?: string;
  hint?: ReactNode;
  placeholder?: string;
  autoComplete?: string;
}

function TextField({
  name,
  label,
  value,
  onChange,
  type = 'text',
  numeric = false,
  unit,
  hint,
  placeholder,
  autoComplete = 'off',
}: TextFieldProps) {
  const id = fieldId(name);
  const invalid = numeric && isInvalidGibierNumber(value);
  const describedBy = [invalid ? `${id}-error` : null, hint ? `${id}-hint` : null].filter(Boolean).join(' ');
  return (
    <div className="min-w-0 space-y-2">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
        {unit && <span className="sr-only">（{unit}）</span>}
      </label>
      <div className="flex items-center gap-2">
        <input
          id={id}
          type={type}
          value={value}
          inputMode={numeric ? 'decimal' : undefined}
          maxLength={type === 'text' ? (numeric ? GIBIER_MAX_NUMBER_TEXT : GIBIER_MAX_SHORT_TEXT) : undefined}
          placeholder={placeholder}
          autoComplete={autoComplete}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={invalid}
          aria-describedby={describedBy || undefined}
          className={cn('min-w-0 flex-1', type !== 'text' && boxClass)}
        />
        {unit && (
          <span className="shrink-0 text-sm text-on-surface-variant" aria-hidden="true">
            {unit}
          </span>
        )}
      </div>
      {invalid && (
        <p id={`${id}-error`} className="text-sm text-destructive">
          半角の数字で入力してください（例：41.5）。
        </p>
      )}
      {hint && (
        <p id={`${id}-hint`} className="text-xs text-on-surface-variant">
          {hint}
        </p>
      )}
    </div>
  );
}

const choices = <T extends string>(labels: Record<T, string>) =>
  (Object.keys(labels) as T[]).map((value) => ({ value, label: labels[value] }));

const PRESENCE = choices({ yes: '有', no: '無' } as Record<Exclude<GibierYesNo, ''>, string>);
const ANSWER = choices({ yes: 'はい', no: 'いいえ' } as Record<Exclude<GibierYesNo, ''>, string>);

function CheckboxGroup<T extends string>({
  legend,
  values,
  labels,
  options,
  onToggle,
}: {
  legend: string;
  values: readonly T[];
  labels: Record<T, string>;
  options: readonly T[];
  onToggle: (value: T) => void;
}) {
  return (
    <fieldset className="min-w-0 space-y-2">
      <legend className="mb-2 text-sm font-medium">{legend}</legend>
      <div className="flex flex-wrap gap-x-5 gap-y-1">
        {options.map((option) => (
          <label key={option} className="flex min-h-12 cursor-pointer items-center gap-2 text-sm">
            <input type="checkbox" checked={values.includes(option)} onChange={() => onToggle(option)} />
            {labels[option]}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** One line of the check, with はい／いいえ beside the item as on the paper form. */
function AnswerRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: GibierYesNo;
  onChange: (value: GibierYesNo) => void;
}) {
  const id = useId();
  return (
    <div
      role="group"
      aria-labelledby={`${id}-label`}
      className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-t border-outline-variant py-2 first:border-t-0"
    >
      <span id={`${id}-label`} className="text-sm">
        {label}
      </span>
      <span className="flex gap-1 rounded-lg bg-surface-container p-1">
        {ANSWER.map((option) => (
          <label key={option.value}>
            <input
              type="radio"
              name={id}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              className="peer sr-only"
            />
            <span
              className={cn(
                'flex min-h-11 w-16 cursor-pointer items-center justify-center rounded-md text-sm',
                'peer-checked:bg-primary peer-checked:font-medium peer-checked:text-on-primary',
                'peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary',
                'hover:bg-[color-mix(in_srgb,var(--md-sys-color-on-surface)_8%,transparent)] peer-checked:hover:bg-primary',
              )}
            >
              {option.label}
            </span>
          </label>
        ))}
      </span>
    </div>
  );
}

const Section = ({ id, title, children }: { id: string; title: string; children: ReactNode }) => (
  <Card variant="outlined" className="space-y-5 rounded-md p-5 sm:p-6">
    <h2 id={id} className="text-xl font-medium">
      {title}
    </h2>
    {children}
  </Card>
);

/**
 * The record in the order the hunter comes to know it: the capture, the animal as found, the kill
 * and bleeding, then the carcass on its way to the facility. The printed sheet keeps 様式 2's order.
 */
export function GibierRecordForm({
  record,
  onPhotosChange,
}: {
  record: GibierRecord;
  /** Told when a photo is added or deleted, so the printed sheet shows the photos as they are. */
  onPhotosChange: () => void;
}) {
  const setField = useGibierRecordStore((state) => state.setField);
  const toggleSite = useGibierRecordStore((state) => state.toggleSite);
  const setAbnormality = useGibierRecordStore((state) => state.setAbnormality);
  const text = (name: Parameters<typeof setField>[0]) => (value: string) =>
    setField(name, value as GibierRecord[typeof name]);

  return (
    <>
      <Section id="capture" title="捕獲">
        <TextField
          name="individualNumber"
          label="個体番号"
          value={record.individualNumber ?? ''}
          onChange={text('individualNumber')}
          hint="タグの番号など。施設が付ける受入個体管理番号とは別です。記録票に QR コードで印刷します。"
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField name="hunterName" label="捕獲者名" value={record.hunterName} onChange={text('hunterName')} />
          <TextField
            name="licenseNumber"
            label="狩猟免許番号"
            value={record.licenseNumber}
            onChange={text('licenseNumber')}
            hint="施設が名簿等で管理していれば、その旨を書いて省略できます。"
          />
        </div>
        <SegmentedControl
          legend="捕獲者の健康状態（発熱、下痢、嘔吐、風邪症状）"
          orientation="inline"
          value={record.hunterSymptoms}
          onChange={(value) => setField('hunterSymptoms', value as GibierYesNo)}
          options={PRESENCE}
        />
        <SegmentedControl
          legend="捕獲獣種"
          orientation="inline"
          value={record.species}
          onChange={(value) => setField('species', value as GibierRecord['species'])}
          options={choices(GIBIER_SPECIES_LABELS)}
        />
        {record.species === 'other' && (
          <TextField
            name="speciesOther"
            label="獣種（その他）"
            value={record.speciesOther}
            onChange={text('speciesOther')}
          />
        )}
        <TextField
          name="capturedAt"
          type="datetime-local"
          label="捕獲日時"
          value={record.capturedAt}
          onChange={text('capturedAt')}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            name="captureCity"
            label="捕獲場所（市町村）"
            value={record.captureCity}
            onChange={text('captureCity')}
          />
          <TextField
            name="captureArea"
            label="捕獲場所（地区・地名など）"
            value={record.captureArea}
            onChange={text('captureArea')}
          />
        </div>
        <GibierLocationField record={record} />
        <TextField name="weather" label="捕獲時の天候" value={record.weather} onChange={text('weather')} />
        <SegmentedControl
          legend="捕獲方法"
          value={record.method}
          onChange={(value) => setField('method', value as GibierRecord['method'])}
          options={choices(GIBIER_METHOD_LABELS)}
        />
        {record.method === 'other' && (
          <TextField
            name="methodOther"
            label="捕獲方法（その他）"
            value={record.methodOther}
            onChange={text('methodOther')}
          />
        )}
        <CheckboxGroup
          legend="くくりわなのかかり部位"
          options={GIBIER_SNARE_SITES}
          labels={GIBIER_SNARE_SITE_LABELS}
          values={record.snareSites}
          onToggle={(site) => toggleSite('snareSites', site)}
        />
        {record.snareSites.includes('other') && (
          <TextField
            name="snareSiteOther"
            label="かかり部位（その他）"
            value={record.snareSiteOther}
            onChange={text('snareSiteOther')}
          />
        )}
      </Section>

      <Section id="animal" title="個体と異常の確認">
        <div className="grid gap-4 sm:grid-cols-2">
          <SegmentedControl
            legend="性別"
            orientation="inline"
            value={record.sex}
            onChange={(value) => setField('sex', value as GibierRecord['sex'])}
            options={[
              { value: 'male', label: 'オス' },
              { value: 'female', label: 'メス' },
            ]}
          />
          {record.sex === 'female' && (
            <SegmentedControl
              legend="妊娠の有無"
              orientation="inline"
              value={record.pregnant}
              onChange={(value) => setField('pregnant', value as GibierYesNo)}
              options={PRESENCE}
            />
          )}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <TextField
            name="estimatedAge"
            numeric
            unit="歳前後"
            label="推定年齢"
            value={record.estimatedAge}
            onChange={text('estimatedAge')}
          />
          <TextField
            name="weightKg"
            numeric
            unit="kg"
            label="体重"
            value={record.weightKg}
            onChange={text('weightKg')}
          />
        </div>
        <section aria-labelledby="gibier-abnormalities" className="space-y-2">
          <h3 id="gibier-abnormalities" className="text-base font-medium">
            異常の確認
          </h3>
          <p className="text-sm text-on-surface-variant">
            ガイドライン 第 2 の 2（1）イ〜ル。1 つでも当てはまる個体は食用にできません。
          </p>
          <div>
            {GIBIER_ABNORMALITY_KEYS.map((key) => {
              const item = GIBIER_ABNORMALITIES[key];
              return (
                <AnswerRow
                  key={key}
                  label={`${item.letter}　${item.form}`}
                  value={record.abnormalities[key]}
                  onChange={(value) => setAbnormality(key, value)}
                />
              );
            })}
          </div>
        </section>
      </Section>

      <Section id="bleeding" title="止め刺し・放血">
        <p className="text-sm text-on-surface-variant">※：様式 2 に欄がなく、ガイドライン 第 3（6）に基づく項目</p>
        <TextField
          name="slaughtererName"
          label="止め刺し者名"
          value={record.slaughtererName}
          onChange={text('slaughtererName')}
          hint="捕獲者と同じ人なら、止め刺し者名と健康状態は省略できます。"
        />
        <SegmentedControl
          legend="止め刺し者の健康状態（発熱、下痢、嘔吐、風邪症状）"
          orientation="inline"
          value={record.slaughtererSymptoms}
          onChange={(value) => setField('slaughtererSymptoms', value as GibierYesNo)}
          options={PRESENCE}
        />
        <CheckboxGroup
          legend="被弾または止め刺し、電気ショッカー行使部位"
          options={GIBIER_HIT_SITES}
          labels={GIBIER_HIT_SITE_LABELS}
          values={record.hitSites}
          onToggle={(site) => toggleSite('hitSites', site)}
        />
        {record.hitSites.includes('other') && (
          <TextField
            name="hitSiteOther"
            label="部位（その他）"
            value={record.hitSiteOther}
            onChange={text('hitSiteOther')}
          />
        )}
        <TextField
          name="slaughterMethod"
          label={`止め刺しの方法${EXTRA}`}
          value={record.slaughterMethod}
          onChange={text('slaughterMethod')}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <SegmentedControl
            legend={`止め刺しに銃を使った${EXTRA}`}
            orientation="inline"
            value={record.slaughterByGun}
            onChange={(value) => setField('slaughterByGun', value as GibierYesNo)}
            options={ANSWER}
          />
          <SegmentedControl
            legend="損傷の有無"
            orientation="inline"
            value={record.injury}
            onChange={(value) => setField('injury', value as GibierYesNo)}
            options={PRESENCE}
          />
        </div>
        {record.injury === 'yes' && (
          <TextField name="injurySite" label="損傷部位" value={record.injurySite} onChange={text('injurySite')} />
        )}
        <CheckboxGroup
          legend="放血用ナイフの消毒方法"
          options={GIBIER_DISINFECTIONS}
          labels={GIBIER_DISINFECTION_LABELS}
          values={record.knifeDisinfection}
          onToggle={(value) => toggleSite('knifeDisinfection', value)}
        />
        <SegmentedControl
          legend="放血"
          orientation="inline"
          value={record.bleeding}
          onChange={(value) => setField('bleeding', value as GibierYesNo)}
          options={PRESENCE}
        />
        {record.bleeding === 'yes' && (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                name="bleedingStartedAt"
                type="datetime-local"
                label="放血の開始日時"
                value={record.bleedingStartedAt}
                onChange={text('bleedingStartedAt')}
              />
              <TextField
                name="bleedingPlace"
                label="放血の場所"
                value={record.bleedingPlace}
                onChange={text('bleedingPlace')}
              />
            </div>
            <SegmentedControl
              legend="心臓が動いている状態で頸動脈又は腕頭動脈を切断した"
              orientation="inline"
              value={record.arteryCut}
              onChange={(value) => setField('arteryCut', value as GibierYesNo)}
              options={ANSWER}
            />
            <SegmentedControl
              legend="放血液の性状"
              orientation="inline"
              value={record.bloodAppearance}
              onChange={(value) => setField('bloodAppearance', value as GibierRecord['bloodAppearance'])}
              options={[
                { value: 'normal', label: '異常なし' },
                { value: 'abnormal', label: '異常あり' },
              ]}
            />
            {record.bloodAppearance === 'abnormal' && (
              <TextField
                name="bloodAppearanceNote"
                label="放血液の異常の内容"
                value={record.bloodAppearanceNote}
                onChange={text('bloodAppearanceNote')}
              />
            )}
          </>
        )}
        <SegmentedControl
          legend="放血後の体温（触診）"
          orientation="inline"
          value={record.palpation}
          onChange={(value) => setField('palpation', value as GibierRecord['palpation'])}
          options={[
            { value: 'high', label: '高温' },
            { value: 'normal', label: '異常なし' },
            { value: 'low', label: '低温' },
          ]}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            name="bodyTemperature"
            numeric
            unit="℃"
            label="放血後の体温（温度計測定）"
            value={record.bodyTemperature}
            onChange={text('bodyTemperature')}
          />
          <TextField
            name="temperatureSite"
            label="計測部位"
            value={record.temperatureSite}
            onChange={text('temperatureSite')}
            placeholder="例：直腸"
          />
        </div>
      </Section>

      <Section id="delivery" title="内臓摘出・冷却・搬入">
        <SegmentedControl
          legend="内臓摘出"
          orientation="inline"
          value={record.evisceration}
          onChange={(value) => setField('evisceration', value as GibierYesNo)}
          options={PRESENCE}
        />
        {record.evisceration === 'yes' && (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                name="eviscerationStartedAt"
                type="time"
                label="内臓摘出の開始時刻"
                value={record.eviscerationStartedAt}
                onChange={text('eviscerationStartedAt')}
              />
              <TextField
                name="eviscerationPlace"
                label="内臓摘出の場所"
                value={record.eviscerationPlace}
                onChange={text('eviscerationPlace')}
              />
            </div>
            <TextField
              name="eviscerationMethod"
              label={`内臓摘出の方法${EXTRA}`}
              value={record.eviscerationMethod}
              onChange={text('eviscerationMethod')}
            />
            <SegmentedControl
              legend={`内臓の異常${EXTRA}`}
              orientation="inline"
              value={record.organAbnormality}
              onChange={(value) => setField('organAbnormality', value as GibierYesNo)}
              options={PRESENCE}
            />
            {record.organAbnormality === 'yes' && (
              <TextField
                name="organAbnormalityNote"
                label="内臓の異常の内容"
                value={record.organAbnormalityNote}
                onChange={text('organAbnormalityNote')}
              />
            )}
            <SegmentedControl
              legend={`臭気の異常${EXTRA}`}
              orientation="inline"
              value={record.odorAbnormality}
              onChange={(value) => setField('odorAbnormality', value as GibierYesNo)}
              options={PRESENCE}
            />
            {record.odorAbnormality === 'yes' && (
              <TextField
                name="odorAbnormalityNote"
                label="臭気の異常の内容"
                value={record.odorAbnormalityNote}
                onChange={text('odorAbnormalityNote')}
              />
            )}
          </>
        )}
        <SegmentedControl
          legend="運搬時の冷却"
          orientation="inline"
          value={record.cooling}
          onChange={(value) => setField('cooling', value as GibierYesNo)}
          options={PRESENCE}
        />
        {record.cooling === 'yes' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              name="coolingStartedAt"
              type="time"
              label="冷却の開始時刻"
              value={record.coolingStartedAt}
              onChange={text('coolingStartedAt')}
            />
            <TextField
              name="coolingMethod"
              label="冷却の方法"
              value={record.coolingMethod}
              onChange={text('coolingMethod')}
            />
          </div>
        )}
        <TextField
          name="deliveredAt"
          type="datetime-local"
          label="施設（または移動式解体処理車）への搬入日時"
          value={record.deliveredAt}
          onChange={text('deliveredAt')}
        />
        <div className="space-y-2">
          <label htmlFor={fieldId('notes')} className="block text-sm font-medium">
            その他特記事項
          </label>
          <textarea
            id={fieldId('notes')}
            rows={3}
            value={record.notes}
            maxLength={GIBIER_MAX_LONG_TEXT}
            onChange={(event) => setField('notes', event.target.value)}
            className={boxClass}
          />
        </div>
      </Section>

      <Section id="photos" title="写真">
        <GibierPhotoField record={record} onChange={onPhotosChange} />
      </Section>
    </>
  );
}
