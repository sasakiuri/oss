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
  SelectField,
  StorageUnavailableNotice,
  ToolLayout,
  discardedSaveMessage,
} from '@/components/labs';
import { Button, Card } from '@/components/ui';
import { useDiscardedSave, useStorageStatus } from '@/lib/browser-storage';
import {
  CONNECTOR_INTERVAL_M,
  FENCE_SOURCES,
  INSPECTION_CHECKLIST,
  SOURCES_CHECKED_ON,
  calculateFence,
  findPreset,
  matchesPreset,
  presetsFor,
  type FenceSourceId,
  type FenceSpecies,
} from '@/lib/electric-fence';
import { labsTool } from '@/lib/labs-tools';
import { MAX_WIRE_ROWS } from '@/lib/schemas/electric-fence';
import { rehydrateLanguage, useLanguage, useSetLanguage } from '@/store';

import { initialElectricFenceSettings, storageKey, useElectricFenceStore } from './_store';
import { FenceFigure } from './fence-figure';
import { FenceLegal } from './fence-legal';

const speciesOrder: readonly FenceSpecies[] = ['boar', 'deer', 'deer-boar', 'monkey', 'bear', 'mesocarnivore'];

export function ElectricFenceClient() {
  const store = useElectricFenceStore();
  const {
    species,
    presetId,
    rows,
    outerWire,
    perimeterM,
    gates,
    corners,
    roughLengthM,
    postSpacingM,
    roughPostSpacingM,
    sparePercent,
    checked,
  } = store;
  const language = useLanguage();
  const setLanguage = useSetLanguage();
  const storageAvailable = useStorageStatus((status) => status.available);
  const discardedSave = useDiscardedSave(storageKey);
  const [ready, setReady] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);

  useEffect(() => {
    void Promise.all([useElectricFenceStore.persist.rehydrate(), rehydrateLanguage()]).then(() => setReady(true));
  }, []);

  const preset = findPreset(presetId);
  const edited = preset ? !matchesPreset(preset, { rows, outerWire }) : true;
  const result = calculateFence({
    rows,
    outerWire,
    perimeterM,
    gates,
    corners,
    roughLengthM,
    postSpacingM,
    roughPostSpacingM,
    sparePercent,
  });

  const number = (value: number, digits = 1) =>
    Number.isFinite(value) ? new Intl.NumberFormat(language, { maximumFractionDigits: digits }).format(value) : '—';
  const speciesName = (value: FenceSpecies) =>
    ({
      boar: t('イノシシ', 'Wild boar'),
      deer: t('シカ', 'Deer'),
      'deer-boar': t('シカ＋イノシシ', 'Deer and wild boar'),
      monkey: t('サル', 'Monkeys'),
      bear: t('クマ', 'Bears'),
      mesocarnivore: t(
        '中型獣（アライグマ・ハクビシン・タヌキ等）',
        'Mid-sized mammals (raccoons, civets, raccoon dogs…)',
      ),
    })[value];
  const sourceName = (id: FenceSourceId) => {
    const source = FENCE_SOURCES[id];
    return `${source.publisher}「${source.title}」`;
  };

  const positiveError = t('0 より大きい数値を入力してください。', 'Enter a number greater than zero.');
  const nonNegativeError = t('0 以上の数値を入力してください。', 'Enter a number of zero or more.');
  const countError = t('0 以上の整数を入力してください。', 'Enter a whole number of zero or more.');
  const perimeterInvalid = !Number.isFinite(perimeterM) || perimeterM <= 0;
  const gatesInvalid = !Number.isInteger(gates) || gates < 0;
  const cornersInvalid = !Number.isInteger(corners) || corners < 0;
  const roughInvalid = !Number.isFinite(roughLengthM) || roughLengthM < 0 || roughLengthM > perimeterM;
  const spacingInvalid = !Number.isFinite(postSpacingM) || postSpacingM <= 0;
  const roughSpacingInvalid = !Number.isFinite(roughPostSpacingM) || roughPostSpacingM <= 0;
  const spareInvalid = !Number.isFinite(sparePercent) || sparePercent < 0 || sparePercent > 100;

  const summary = result
    ? t(
        `通電する柵線 ${number(result.total.energizedWireM)} m、支柱 ${result.total.posts + result.total.outerPosts} 本、ガイシ ${result.total.insulators} 個、グリップ ${result.total.grips} 個。`,
        `${number(result.total.energizedWireM)} m of powered wire, ${result.total.posts + result.total.outerPosts} posts, ${result.total.insulators} insulators, ${result.total.grips} gate handles.`,
      )
    : rows.length === 0 && !outerWire.enabled
      ? t('「段の高さ」で段を追加してください。', 'Add rows under “Rows”.')
      : t('赤く示した入力を直してください。', 'Correct the fields marked in red.');

  useEffect(() => {
    // Announced once typing settles.
    const timer = window.setTimeout(() => setAnnouncement(summary), 700);
    return () => window.clearTimeout(timer);
  }, [summary]);

  const presetOptions = presetsFor(species).map((item) => ({
    value: item.id,
    label: `${FENCE_SOURCES[item.source].publisher}${item.source === 'maff-general' || item.source === 'maff-mesocarnivore' ? `・${FENCE_SOURCES[item.source].title.replace('野生鳥獣被害防止マニュアル', '')}` : ''}`,
  }));
  const checkedCount = INSPECTION_CHECKLIST.filter((item) => checked.includes(item.id)).length;
  const setLayout = store.setLayout;

  return (
    <AppLayout
      header={
        <AppHeader
          title={labsTool('electric-fence').title[language]}
          actions={
            <>
              <ResetButton
                language={language}
                description={{
                  ja: '獣種・出典・段・柵の長さと点検のチェックを初期値に戻します。',
                  en: 'Resets the species, source, rows, fence length and inspection ticks.',
                }}
                onReset={() =>
                  useElectricFenceStore.setState({
                    ...initialElectricFenceSettings,
                    lastValidSettings: initialElectricFenceSettings,
                  })
                }
              />
              <LanguageMenu language={language} onLanguageChange={setLanguage} />
            </>
          }
        />
      }
    >
      {/* Mounted empty from the first paint; a live region inserted with its text is not announced. */}
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
          resultLabel={t('計算結果', 'Results')}
          primary={
            <>
              <Card variant="outlined" className="space-y-5 rounded-md p-5 sm:p-6">
                <h2 id="design" className="text-xl font-medium">
                  {t('獣種と出典', 'Species and source')}
                </h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  <SelectField
                    label={t('対象の獣種', 'Species')}
                    value={species}
                    onChange={(value) => store.setSpecies(value as FenceSpecies)}
                    options={speciesOrder.map((value) => ({ value, label: speciesName(value) }))}
                  />
                  <SelectField
                    label={t('出典', 'Source')}
                    value={preset && preset.species === species ? presetId : ''}
                    onChange={(value) => store.choosePreset(value)}
                    options={[
                      ...(preset && preset.species === species
                        ? []
                        : [{ value: '', label: t('（選択）', '(choose)') }]),
                      ...presetOptions,
                    ]}
                    hint={t('出典の段の高さが入ります。', 'Fills in the source’s row heights.')}
                  />
                </div>
                {preset && (
                  <div className="space-y-2 rounded-sm bg-surface-container p-4 text-sm">
                    <p>
                      <span lang="ja">{sourceName(preset.source)}</span>
                      <span lang="ja">
                        （{FENCE_SOURCES[preset.source].issued}、{preset.locator}）
                      </span>
                    </p>
                    <p className="text-on-surface-variant">{t(preset.note.ja, preset.note.en)}</p>
                    {preset.outerWire && (
                      <p className="text-on-surface-variant">
                        {t('外側の線：', 'Outer line: ')}
                        {t(preset.outerWire.range.ja, preset.outerWire.range.en)}
                      </p>
                    )}
                    <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-[auto_minmax(0,1fr)]">
                      <dt className="text-on-surface-variant">{t('電圧', 'Voltage')}</dt>
                      <dd>{preset.voltage ? t(preset.voltage.ja, preset.voltage.en) : t('記載なし', 'Not stated')}</dd>
                      <dt className="text-on-surface-variant">{t('舗装などからの離隔', 'Clearance from paving')}</dt>
                      <dd>
                        {preset.pavementClearanceCm
                          ? t(`${preset.pavementClearanceCm} cm 以上`, `${preset.pavementClearanceCm} cm or more`)
                          : t('数値の記載なし', 'No figure given')}
                      </dd>
                    </dl>
                    {edited && (
                      <p className="font-medium">
                        {t('出典の値から変更しています。', 'Changed from the source’s values.')}
                      </p>
                    )}
                  </div>
                )}
              </Card>

              <Card variant="outlined" className="space-y-5 rounded-md p-5 sm:p-6">
                <h2 id="layout" className="text-xl font-medium">
                  {t('柵の長さと支柱', 'Length and posts')}
                </h2>
                <div className="grid grid-cols-2 items-start gap-4">
                  <NumberField
                    label={t('外周長', 'Perimeter')}
                    unit="m"
                    value={perimeterM}
                    onChange={(value) => setLayout({ perimeterM: value })}
                    min={0}
                    invalid={perimeterInvalid}
                    errorText={positiveError}
                  />
                  <NumberField
                    label={t('支柱間隔', 'Post spacing')}
                    unit="m"
                    value={postSpacingM}
                    onChange={(value) => setLayout({ postSpacingM: value })}
                    min={0}
                    invalid={spacingInvalid}
                    errorText={positiveError}
                    hint={
                      preset?.postSpacingM
                        ? t(
                            `出典は ${preset.postSpacingM[0]}〜${preset.postSpacingM[1]} m。短い側を入れています。`,
                            `Source: ${preset.postSpacingM[0]}–${preset.postSpacingM[1]} m; the shorter end is entered.`,
                          )
                        : t('出典に記載なし。', 'Not given by the source.')
                    }
                  />
                  <NumberField
                    label={t('角の数', 'Corners')}
                    value={corners}
                    step={1}
                    onChange={(value) => setLayout({ corners: value })}
                    min={0}
                    invalid={cornersInvalid}
                    errorText={countError}
                  />
                  <NumberField
                    label={t('出入口の数', 'Gates')}
                    value={gates}
                    step={1}
                    onChange={(value) => setLayout({ gates: value })}
                    min={0}
                    invalid={gatesInvalid}
                    errorText={countError}
                  />
                </div>
              </Card>
            </>
          }
          result={
            <Card variant="outlined" className="min-w-0 space-y-5 rounded-md p-5 sm:p-6">
              <h2 id="result" className="text-xl font-medium">
                {t('必要な資材', 'Materials')}
              </h2>
              <ResultPanel className="sm:grid-cols-2">
                <ResultFigure
                  size="lead"
                  label={t('通電する柵線の総延長', 'Powered wire, total')}
                  value={result ? number(result.total.energizedWireM) : '—'}
                  unit="m"
                  note={
                    result
                      ? t(
                          `${number(perimeterM)} m × ${result.energizedRows} 段${outerWire.enabled ? ` ＋ 外側の線 ${number(result.outerLengthM)} m` : ''}`,
                          `${number(perimeterM)} m × ${result.energizedRows} rows${outerWire.enabled ? ` + outer line ${number(result.outerLengthM)} m` : ''}`,
                        )
                      : undefined
                  }
                />
                {result && result.cordRows > 0 && (
                  <ResultFigure
                    label={t('ヒモ（通電しない段）', 'Unpowered cord')}
                    value={number(result.total.cordM)}
                    unit="m"
                    note={t(`${result.cordRows} 段`, `${result.cordRows} rows`)}
                  />
                )}
                <ResultFigure
                  label={t('支柱', 'Posts')}
                  value={result ? String(result.total.posts) : '—'}
                  unit={t('本', '')}
                  note={
                    result
                      ? t(
                          `うち角・出入口の両脇・起伏区間の両端に ${result.fixedPoints} 本`,
                          `${result.fixedPoints} at corners, gate sides and ends of the uneven stretch`,
                        )
                      : undefined
                  }
                />
                {result && outerWire.enabled && (
                  <ResultFigure
                    label={t('外側の線の支柱', 'Posts for the outer line')}
                    value={String(result.total.outerPosts)}
                    unit={t('本', '')}
                  />
                )}
                <ResultFigure
                  label={t('ガイシ（またはクリップ）', 'Insulators (or clips)')}
                  value={result ? String(result.total.insulators) : '—'}
                  unit={t('個', '')}
                />
                <ResultFigure
                  label={t('出入口のグリップ', 'Gate handles')}
                  value={result ? String(result.total.grips) : '—'}
                  unit={t('個', '')}
                />
                {result && result.base.connectors > 0 && (
                  <ResultFigure
                    label={t('上下の段をつなぐ接続線', 'Leads joining the rows')}
                    value={String(result.total.connectors)}
                    unit={t('か所', '')}
                    note={t(`${CONNECTOR_INTERVAL_M} m 毎（鳥取県）`, `One every ${CONNECTOR_INTERVAL_M} m (Tottori)`)}
                  />
                )}
              </ResultPanel>
              {!result && <p className="text-sm text-destructive">{summary}</p>}
              <FenceFigure
                rows={rows}
                outerWire={outerWire}
                label={t(
                  `段の地上高の図：${rows.map((row) => `${row.heightCm} cm${row.energized ? '' : '（通電しない）'}`).join('、') || 'なし'}`,
                  `Row heights: ${rows.map((row) => `${row.heightCm} cm${row.energized ? '' : ' (unpowered)'}`).join(', ') || 'none'}`,
                )}
                energizedLabel={t('通電', 'powered')}
                cordLabel={t('ヒモ', 'cord')}
                outerLabel={t('外側', 'outer')}
              />
            </Card>
          }
          secondary={
            <>
              <Card variant="outlined" className="space-y-5 rounded-md p-5 sm:p-6">
                <h2 id="rows" className="text-xl font-medium">
                  {t('段の高さ', 'Rows')}
                </h2>
                <fieldset className="space-y-3">
                  <legend className="text-sm font-medium">{t('地面からの高さ', 'Height above the ground')}</legend>
                  {rows.length === 0 && (
                    <p className="text-sm text-destructive">
                      {t(
                        'この出典は段の高さを数値で示していません。「段を追加」から入力してください。',
                        'This source gives no row heights. Add them with “Add a row”.',
                      )}
                    </p>
                  )}
                  {rows.map((row, index) => {
                    const invalid = !Number.isFinite(row.heightCm) || row.heightCm <= 0;
                    return (
                      <div key={index} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-start gap-3">
                        <NumberField
                          label={t(`${index + 1} 段目`, `Row ${index + 1}`)}
                          unit="cm"
                          value={row.heightCm}
                          onChange={(heightCm) => store.setRow(index, { ...row, heightCm })}
                          min={0}
                          invalid={invalid}
                          errorText={positiveError}
                        />
                        <label className="mt-7 flex min-h-12 cursor-pointer items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={row.energized}
                            onChange={(event) => store.setRow(index, { ...row, energized: event.target.checked })}
                          />
                          {t('通電', 'Powered')}
                        </label>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="mt-7"
                          aria-label={t(`${index + 1} 段目を削除`, `Remove row ${index + 1}`)}
                          onClick={() => store.removeRow(index)}
                        >
                          <LuTrash2 aria-hidden="true" />
                        </Button>
                      </div>
                    );
                  })}
                  <Button variant="outline" onClick={store.addRow} disabled={rows.length >= MAX_WIRE_ROWS}>
                    <LuPlus aria-hidden="true" />
                    {t('段を追加', 'Add a row')}
                  </Button>
                </fieldset>
                <div className="space-y-3">
                  <label className="flex min-h-12 cursor-pointer items-center gap-2 text-sm font-medium">
                    <input
                      type="checkbox"
                      checked={outerWire.enabled}
                      onChange={(event) => store.setOuterWire({ ...outerWire, enabled: event.target.checked })}
                    />
                    {t('外側に線を 1 本足す（クマ用）', 'Add a trip line in front (for bears)')}
                  </label>
                  {outerWire.enabled && (
                    <div className="grid grid-cols-2 items-start gap-4">
                      <NumberField
                        label={t('外側の線の地上高', 'Outer line height')}
                        unit="cm"
                        value={outerWire.heightCm}
                        onChange={(heightCm) => store.setOuterWire({ ...outerWire, heightCm })}
                        min={0}
                        invalid={!Number.isFinite(outerWire.heightCm) || outerWire.heightCm <= 0}
                        errorText={positiveError}
                      />
                      <NumberField
                        label={t('柵からの距離', 'Distance in front')}
                        unit="cm"
                        value={outerWire.offsetCm}
                        onChange={(offsetCm) => store.setOuterWire({ ...outerWire, offsetCm })}
                        min={0}
                        invalid={!Number.isFinite(outerWire.offsetCm) || outerWire.offsetCm < 0}
                        errorText={nonNegativeError}
                      />
                    </div>
                  )}
                </div>
              </Card>

              <ConditionSection
                id="uneven"
                title={t('起伏区間と予備', 'Uneven ground and spare')}
                summary={t(
                  `起伏区間 ${number(roughLengthM)} m・予備 ${number(sparePercent)} %`,
                  `Uneven stretch ${number(roughLengthM)} m, spare ${number(sparePercent)} %`,
                )}
                forceOpen={roughInvalid || roughSpacingInvalid || spareInvalid}
              >
                <div className="grid grid-cols-2 items-start gap-4">
                  <NumberField
                    label={t('起伏区間の長さ', 'Uneven stretch')}
                    unit="m"
                    value={roughLengthM}
                    onChange={(value) => setLayout({ roughLengthM: value })}
                    min={0}
                    invalid={roughInvalid}
                    errorText={t('0 以上、外周長以下で入力してください。', 'Enter zero or more, up to the perimeter.')}
                    hint={t('外周のうち支柱間隔を詰める区間。', 'The part of the perimeter where posts go closer.')}
                  />
                  <NumberField
                    label={t('起伏区間の支柱間隔', 'Spacing on uneven ground')}
                    unit="m"
                    value={roughPostSpacingM}
                    onChange={(value) => setLayout({ roughPostSpacingM: value })}
                    min={0}
                    invalid={roughSpacingInvalid}
                    errorText={positiveError}
                    hint={t(
                      '最下段と地面の間が広がらない間隔に（京都府は 20 cm 以下）。',
                      'Close enough that the gap under the lowest wire holds (Kyoto: 20 cm or less).',
                    )}
                  />
                  <NumberField
                    label={t('予備率', 'Spare')}
                    unit="%"
                    value={sparePercent}
                    onChange={(value) => setLayout({ sparePercent: value })}
                    min={0}
                    max={100}
                    invalid={spareInvalid}
                    errorText={t('0 から 100 の範囲で入力してください。', 'Enter 0 to 100.')}
                    hint={t(
                      '柵線・支柱・ガイシ・グリップに上乗せし、切り上げます。',
                      'Added to wire, posts, insulators and handles, rounded up.',
                    )}
                  />
                </div>
              </ConditionSection>
            </>
          }
          extras={
            <>
              <FenceLegal language={language} />

              <ConditionSection
                id="checklist"
                title={t('効かないときの点検', 'When the fence is not working')}
                summary={t(
                  `${INSPECTION_CHECKLIST.length} 項目中 ${checkedCount} 項目を確認済み`,
                  `${checkedCount} of ${INSPECTION_CHECKLIST.length} checked`,
                )}
              >
                <ul className="space-y-3">
                  {INSPECTION_CHECKLIST.map((item) => (
                    <li key={item.id} className="text-sm">
                      <label className="flex cursor-pointer items-start gap-3">
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={checked.includes(item.id)}
                          onChange={() => store.toggleChecked(item.id)}
                        />
                        <span>
                          <span className="block">{t(item.text.ja, item.text.en)}</span>
                          <span lang="ja" className="mt-1 block text-xs text-on-surface-variant">
                            {item.sources
                              .map(
                                (ref) =>
                                  `${FENCE_SOURCES[ref.id].publisher.replace('（過去のマニュアル）', '')}（${ref.where}）`,
                              )
                              .join('・')}
                          </span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </ConditionSection>

              <ConditionSection
                id="sources"
                title={t('出典', 'Sources')}
                summary={t(
                  `農林水産省・鳥取県・福井県・京都府の資料と電気設備の技術基準（${SOURCES_CHECKED_ON} 確認）`,
                  `Manuals of MAFF and three prefectures, and the electrical technical standards (checked ${SOURCES_CHECKED_ON})`,
                )}
              >
                <ul className="space-y-2 text-sm text-on-surface-variant">
                  {(Object.keys(FENCE_SOURCES) as FenceSourceId[]).map((id) => {
                    const source = FENCE_SOURCES[id];
                    return (
                      <li key={id} lang="ja">
                        {source.publisher}「
                        <a href={source.url} target="_blank" rel="noreferrer" className="underline">
                          {source.title}
                        </a>
                        」（{source.issued}）{source.superseded ? '— 過去の版（現行の総合対策編と併用）' : ''}
                      </li>
                    );
                  })}
                </ul>
                <p className="text-sm text-on-surface-variant">
                  {t(
                    '地域の実情は、市町村の鳥獣被害対策の担当や都道府県の普及指導機関に確認してください。',
                    'For local conditions, ask your municipality’s wildlife damage office or the prefecture’s extension service.',
                  )}
                </p>
              </ConditionSection>

              <ConditionSection
                id="notes"
                title={t('計算方法', 'How it is counted')}
                summary={t(
                  '支柱・ガイシ・グリップの数え方と、含まない資材',
                  'Posts, insulators and handles, and what is left out',
                )}
              >
                <ul className="space-y-2 text-sm text-on-surface-variant">
                  <li>
                    {t(
                      '支柱：角・出入口の両脇・起伏区間の両端（起伏区間は 1 か所とします）に立て、その間を支柱間隔以下で割ります。辺の長さを入力しないため「外周÷間隔の切り上げ（起伏区間は詰めた間隔）＋固定する支柱 − 1」本で、どの配置でも足ります。実際は最大で「固定する支柱 − 1」本少なく済みます。',
                      'Posts: one at every corner, both sides of each gate and both ends of the uneven stretch (taken as one stretch), with the lengths between split at no more than the post spacing. Side lengths are not entered, so the count is perimeter ÷ spacing rounded up (closer on the uneven stretch) plus fixed posts − 1. That is enough for any layout; a real one may need up to (fixed posts − 1) fewer.',
                    )}
                  </li>
                  <li>
                    {t(
                      'ガイシ：支柱ごとに通電する段の数。角は段ごとに 2 個（京都府）。グリップ：出入口ごとに通電する線の数。',
                      'Insulators: one per powered row on each post, two at corners (Kyoto). Gate handles: one per powered line at each gate.',
                    )}
                  </li>
                  <li>
                    {t(
                      '出典の値が範囲のときは、支柱間隔は短い側、高さと距離は下限を入れています。',
                      'Where a source gives a range, post spacing uses the short end and heights and distances the lower end.',
                    )}
                  </li>
                  <li>
                    {t(
                      '外側の線は、柵が凸形に囲むものとして計算します。地形・角の形・資材の規格（1 巻の長さ・支柱の長さ）で数量は変わります。',
                      'The outer line assumes the fence encloses a convex shape. Ground, corner shapes and material sizes (reel and post lengths) change the quantities.',
                    )}
                  </li>
                  <li>
                    {t(
                      '電源装置・アース棒・危険表示板・ネット・防草シートは含みません。電源装置は柵の延長に合う能力のものを説明書で選んでください。',
                      'Energiser, earth rods, danger signs, nets and weed sheets are not included. Choose an energiser rated for the fence length, per its manual.',
                    )}
                  </li>
                </ul>
                {storageAvailable && (
                  <p className="text-sm text-on-surface-variant">
                    {t('入力はこのブラウザーに保存されます。', 'Saved in this browser.')}
                  </p>
                )}
              </ConditionSection>
            </>
          }
        />
      </div>
    </AppLayout>
  );
}
