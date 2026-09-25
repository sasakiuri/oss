'use client';

import { useEffect, useState } from 'react';
import { LuPrinter, LuSave } from 'react-icons/lu';

import {
  AppHeader,
  AppLayout,
  ConditionSection,
  DiscardedSaveNotice,
  LanguageMenu,
  NumberField,
  ResetButton,
  SegmentedControl,
  StorageUnavailableNotice,
  discardedSaveMessage,
} from '@/components/labs';
import { Button, Card } from '@/components/ui';
import { useDiscardedSave, useStorageStatus } from '@/lib/browser-storage';
import { FIT_SOURCES, tallyEyeTrials, type CastSide, type EyeTrial, type FitUnit } from '@/lib/gun-fit';
import { labsTool } from '@/lib/labs-tools';
import { FIT_NOTE_MAX_LENGTH, FIT_TEXT_MAX_LENGTH } from '@/lib/schemas/gun-fit';
import { rehydrateLanguage, useLanguage, useSetLanguage } from '@/store';

import { MAX_EYE_TRIALS, storageKey, useGunFitStore } from './_store';
import { FitPrintSheet, StockDiagram } from './fit-sheet';
import styles from './gun-fit-print.module.css';

type Message = [ja: string, en: string];

export function GunFitClient() {
  const store = useGunFitStore();
  const { sheet, sheets, trials } = store;
  const language = useLanguage();
  const setLanguage = useSetLanguage();
  const storageAvailable = useStorageStatus((status) => status.available);
  const discardedSave = useDiscardedSave(storageKey);
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);

  useEffect(() => {
    void Promise.all([useGunFitStore.persist.rehydrate(), rehydrateLanguage()]).then(() => setReady(true));
  }, []);

  const unitLabel = sheet.unit === 'mm' ? 'mm' : 'in';
  const tally = tallyEyeTrials(trials);
  const eyeName = (eye: EyeTrial) =>
    ({ right: t('右目', 'Right eye'), left: t('左目', 'Left eye'), unclear: t('はっきりしない', 'Unclear') })[eye];
  const length = (key: 'lengthOfPull' | 'dropAtComb' | 'dropAtHeel' | 'cast', label: string, hint: string) => (
    <NumberField
      label={label}
      unit={unitLabel}
      value={sheet[key] ?? NaN}
      min={0}
      step={sheet.unit === 'mm' ? 0.5 : 0.01}
      hint={hint}
      invalid={sheet[key] !== null && sheet[key]! < 0}
      errorText={t('0 以上の数値を入力してください。', 'Enter a number of zero or more.')}
      onChange={(value) => store.setSheet({ [key]: Number.isFinite(value) ? value : null })}
    />
  );
  const text = (key: 'name' | 'shooter', label: string) => (
    <div className="min-w-0 space-y-2">
      <label htmlFor={`fit-${key}`} className="block text-sm font-medium">
        {label}
      </label>
      <input
        id={`fit-${key}`}
        type="text"
        value={sheet[key]}
        maxLength={FIT_TEXT_MAX_LENGTH}
        onChange={(event) => store.setSheet({ [key]: event.target.value })}
      />
    </div>
  );

  return (
    <AppLayout
      header={
        <AppHeader
          className="print:hidden"
          title={labsTool('gun-fit').title[language]}
          actions={
            <>
              <ResetButton
                language={language}
                description={{
                  ja: '入力中の寸法シートと利き目テストの記録を消します。保存したシートは残ります。',
                  en: 'The sheet being filled in and the eye test tally are cleared. Saved sheets are kept.',
                }}
                onReset={() => {
                  store.clearSheet();
                  store.clearTrials();
                  setMessage(null);
                }}
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
      <div lang={language} className="space-y-6 print:hidden" inert={!ready} aria-busy={!ready}>
        <DiscardedSaveNotice storageKey={storageKey} language={language} />
        <StorageUnavailableNotice available={storageAvailable} language={language} />

        <Card variant="outlined" className="space-y-5 rounded-md p-5 sm:p-6">
          <h2 className="text-xl font-medium">{t('銃床の寸法シート', 'Stock dimension sheet')}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {text('name', t('銃の名前', 'Gun'))}
            {text('shooter', t('射手', 'Shooter'))}
          </div>
          <SegmentedControl
            legend={t('単位', 'Unit')}
            orientation="inline"
            value={sheet.unit}
            options={[
              { value: 'mm', label: 'mm' },
              { value: 'inch', label: t('インチ', 'inch') },
            ]}
            onChange={(value) => store.setUnit(value as FitUnit)}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            {length(
              'lengthOfPull',
              t('引き長', 'Length of pull'),
              t(
                '前の引き金から床尾（リコイルパッド）の中央まで。',
                'From the front trigger to the middle of the butt (recoil pad).',
              ),
            )}
            {length(
              'dropAtComb',
              t('コム落差', 'Drop at comb'),
              t(
                'リブ（銃身の上面）の延長線からコムまでの縦の距離。',
                'Down from the line of the rib (top of the barrels) to the comb.',
              ),
            )}
            {length(
              'dropAtHeel',
              t('ヒール落差', 'Drop at heel'),
              t(
                'リブの延長線からヒール（床尾の上端）までの縦の距離。',
                'Down from the line of the rib to the heel of the stock.',
              ),
            )}
            {length(
              'cast',
              t('キャスト', 'Cast'),
              t(
                '銃身の中心線から床尾の中央までの横のずれ。',
                'Sideways offset of the middle of the butt from the midline of the barrels.',
              ),
            )}
          </div>
          <SegmentedControl
            legend={t('キャストの向き（銃の後ろから見て）', 'Cast direction (seen from behind the gun)')}
            orientation="inline"
            value={sheet.castSide}
            options={[
              { value: 'none', label: t('なし', 'None') },
              { value: 'left', label: t('左', 'Left') },
              { value: 'right', label: t('右', 'Right') },
            ]}
            onChange={(value) => store.setSheet({ castSide: value as CastSide })}
          />
          <div className="space-y-2">
            <label htmlFor="fit-note" className="block text-sm font-medium">
              {t('メモ（ピッチ、ヒール・トウ側の引き長など）', 'Note (pitch, length to heel and toe, and so on)')}
            </label>
            <textarea
              id="fit-note"
              rows={3}
              maxLength={FIT_NOTE_MAX_LENGTH}
              value={sheet.note}
              onChange={(event) => store.setSheet({ note: event.target.value })}
              className="w-full rounded-sm border border-outline bg-surface p-3 text-base text-on-surface"
            />
          </div>
          <div className="mx-auto max-w-md text-on-surface">
            <StockDiagram language={language} className="block h-auto w-full" />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => {
                const ok = store.saveSheet();
                setMessage(
                  ok
                    ? useStorageStatus.getState().available
                      ? ['シートを保存しました。', 'Sheet saved.']
                      : ['この端末に保存できませんでした。', 'Could not save to this device.']
                    : ['銃の名前を入れてから保存してください。', 'Enter the gun’s name before saving.'],
                );
              }}
            >
              <LuSave aria-hidden="true" />
              {t('シートを保存', 'Save the sheet')}
            </Button>
            <Button variant="outline" onClick={() => window.print()}>
              <LuPrinter aria-hidden="true" />
              {t('A4 で印刷', 'Print on A4')}
            </Button>
          </div>
          <p role="status" className="text-sm">
            {message ? t(...message) : ''}
          </p>
          {sheets.length > 0 && (
            <ul className="divide-y divide-outline-variant border-y border-outline-variant">
              {sheets.map((item) => (
                <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <p className="min-w-0 font-medium">
                    {item.name}
                    {item.shooter && <span className="text-on-surface-variant">{`（${item.shooter}）`}</span>}
                  </p>
                  <div className="flex gap-1">
                    <Button variant="outline" onClick={() => store.loadSheet(item.id)}>
                      {t('呼び出す', 'Load')}
                    </Button>
                    <Button
                      variant="ghost"
                      aria-label={t(`${item.name} を削除`, `Delete ${item.name}`)}
                      onClick={() => store.deleteSheet(item.id)}
                    >
                      {t('削除', 'Delete')}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-on-surface-variant">
            {t('印刷は A4 縦、余白なしで。', 'Print on A4 portrait with no margins.')}
          </p>
        </Card>

        <Card variant="outlined" className="space-y-5 rounded-md p-5 sm:p-6">
          <h2 className="text-xl font-medium">{t('利き目（優位眼）のテスト', 'Eye dominance test')}</h2>
          <ol className="list-decimal space-y-2 pl-5 text-sm">
            <li>
              {t(
                '両腕をまっすぐ前に伸ばし、両手を重ねて小さな穴（三角形）を作ります。',
                'Stretch both arms straight out and overlap the hands to make a small opening.',
              )}
            </li>
            <li>
              {t(
                '両目を開けたまま、穴を体の正面に保ち、遠くの小さな目標（文字など）を穴の中央に入れます。',
                'With both eyes open and the opening in front of the middle of the body, centre a small distant mark, such as a letter, in it.',
              )}
            </li>
            <li>
              {t(
                '片目ずつ閉じます（または覆ってもらいます）。目標が穴の中央に残ったほうの目が、その回の結果です。',
                'Close one eye at a time (or have it covered). The eye that keeps the mark centred is the result of that trial.',
              )}
            </li>
            <li>
              {t('手を下ろしてやり直し、何回か繰り返します。', 'Lower the hands, start again, and repeat a few times.')}
            </li>
          </ol>
          <div className="grid grid-cols-3 gap-2">
            {(['right', 'left', 'unclear'] as const).map((eye) => (
              <Button
                key={eye}
                variant={eye === 'unclear' ? 'outline' : 'default'}
                disabled={trials.length >= MAX_EYE_TRIALS}
                onClick={() => store.addTrial(eye)}
              >
                {eyeName(eye)}
              </Button>
            ))}
          </div>
          <p role="status" className="text-sm">
            {tally.trials === 0
              ? ''
              : t(
                  `${tally.trials} 回：右目 ${tally.right}・左目 ${tally.left}・はっきりしない ${tally.unclear}。${tally.dominant === null ? '半数を超えた目はありません。' : `半数を超えたのは${tally.dominant === 'right' ? '右目' : '左目'}です。`}`,
                  `${tally.trials} trials: right ${tally.right}, left ${tally.left}, unclear ${tally.unclear}. ${tally.dominant === null ? 'Neither eye in more than half.' : `The ${tally.dominant} eye in more than half.`}`,
                )}
          </p>
          <Button variant="ghost" disabled={trials.length === 0} onClick={store.clearTrials}>
            {t('記録を消してやり直す', 'Clear and start over')}
          </Button>
          <p className="text-xs text-on-surface-variant">
            {t(
              '下の論文では、別の方法と結果が一致したのは 72.7% でした。',
              'In the paper below, this test agreed with another method in 72.7% of cases.',
            )}
          </p>
        </Card>

        <ConditionSection
          id="gun-fit-sources"
          title={t('出典', 'Sources')}
          summary={t(`${FIT_SOURCES.checkedOn} 確認`, `Checked ${FIT_SOURCES.checkedOn}`)}
        >
          <ul className="space-y-2 text-sm">
            {[FIT_SOURCES.orvis, FIT_SOURCES.browning, FIT_SOURCES.eye].map((source) => (
              <li key={source.url}>
                <a href={source.url} target="_blank" rel="noreferrer" className="underline" lang="en">
                  {source.name}
                </a>
              </li>
            ))}
          </ul>
          <p className="text-sm text-on-surface-variant">
            {t(
              '寸法の定義は Orvis と Browning、利き目のテストは上の論文によります。',
              'Definitions from Orvis and Browning; the eye test from the paper above.',
            )}
          </p>
        </ConditionSection>
      </div>
      <div className={styles.sheet}>
        <FitPrintSheet sheet={sheet} language={language} />
      </div>
    </AppLayout>
  );
}
