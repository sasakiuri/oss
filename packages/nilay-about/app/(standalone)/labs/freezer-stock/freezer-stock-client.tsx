'use client';

import { useEffect, useState } from 'react';
import { LuMinus, LuPlus, LuTrash2 } from 'react-icons/lu';

import {
  AppHeader,
  AppLayout,
  ConditionSection,
  DiscardedSaveNotice,
  LanguageMenu,
  NumberField,
  SegmentedControl,
  StorageUnavailableNotice,
  ToolLayout,
  discardedSaveMessage,
} from '@/components/labs';
import { Button, Card } from '@/components/ui';
import { useDiscardedSave, useStorageStatus } from '@/lib/browser-storage';
import {
  FREEZER_SOURCES,
  FREEZER_SOURCES_CHECKED_ON,
  daysFrozen,
  freezerTotals,
  isoDate,
  sortFreezerItems,
  checkUseBy,
  type FreezerItem,
  type FreezerSpecies,
} from '@/lib/freezer-stock';
import { saleCuts } from '@/lib/game-cuts';
import { labsTool } from '@/lib/labs-tools';
import { FREEZER_MAX_ITEMS, FREEZER_MAX_TEXT } from '@/lib/schemas/freezer-stock';
import { cn } from '@/lib/utils';
import { rehydrateLanguage, useLanguage, useSetLanguage } from '@/store';

import { storageKey, useFreezerStore } from './_store';

type Draft = Omit<FreezerItem, 'id'>;

const blankDraft = (today: string): Draft => ({
  species: 'deer',
  cut: '',
  gramsPerPack: null,
  packs: 1,
  frozenOn: today,
  useBy: '',
  note: '',
});

export function FreezerStockClient() {
  const items = useFreezerStore((state) => state.items);
  const { addItem, takeOne, removeItem, removeEmpty, deleteAll } = useFreezerStore.getState();
  const language = useLanguage();
  const setLanguage = useSetLanguage();
  const storageAvailable = useStorageStatus((status) => status.available);
  const discarded = useDiscardedSave(storageKey);
  const [ready, setReady] = useState(false);
  // Read after mount: the server's calendar is not the reader's.
  const [today, setToday] = useState<Date | null>(null);
  const [draft, setDraft] = useState<Draft>(blankDraft(''));
  const [notice, setNotice] = useState('');
  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);

  useEffect(() => {
    void Promise.all([useFreezerStore.persist.rehydrate(), rehydrateLanguage()]).then(() => {
      const now = new Date();
      setToday(now);
      setDraft((current) => (current.frozenOn ? current : { ...current, frozenOn: isoDate(now) }));
      setReady(true);
    });
    const sync = (event: StorageEvent) => {
      if (event.key === null || event.key === storageKey) void useFreezerStore.persist.rehydrate();
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);

  const number = (value: number, digits = 1) =>
    new Intl.NumberFormat(language, { maximumFractionDigits: digits }).format(value);
  const speciesName = (value: FreezerSpecies) =>
    ({ deer: t('シカ', 'Deer'), boar: t('イノシシ', 'Wild boar'), other: t('その他', 'Other') })[value];
  const sorted = sortFreezerItems(items);
  const totals = freezerTotals(items);
  const cutOptions = draft.species === 'other' ? [] : saleCuts(draft.species).map((cut) => cut[language]);
  const packsInvalid = !Number.isInteger(draft.packs) || draft.packs < 1;
  const gramsInvalid = draft.gramsPerPack !== null && !(draft.gramsPerPack >= 0);

  const add = () => {
    if (packsInvalid || gramsInvalid) return;
    const added = addItem({ ...draft, cut: draft.cut.trim(), note: draft.note.trim() });
    setNotice(
      added
        ? t('冷凍庫に追加しました。', 'Added to the freezer.')
        : t(`登録できるのは ${FREEZER_MAX_ITEMS} 行までです。`, `The list holds up to ${FREEZER_MAX_ITEMS} lines.`),
    );
    if (added) setDraft({ ...blankDraft(draft.frozenOn), species: draft.species });
  };

  const lineName = (item: FreezerItem) =>
    [speciesName(item.species), item.cut || t('部位未入力', 'No cut given')].join(t('・', ' · '));

  return (
    <AppLayout
      header={
        <AppHeader
          title={labsTool('freezer-stock').title[language]}
          actions={<LanguageMenu language={language} onLanguageChange={setLanguage} />}
        />
      }
    >
      <p className="sr-only" role="status" lang={language}>
        {discarded ? discardedSaveMessage(language, 'record') : ''}
      </p>
      <div lang={language} className="space-y-6" inert={!ready} aria-busy={!ready}>
        <DiscardedSaveNotice storageKey={storageKey} language={language} subject="record" />
        <StorageUnavailableNotice available={storageAvailable} language={language} />
        <ToolLayout
          resultLabel={t('冷凍庫の中身', 'In the freezer')}
          primary={
            <Card variant="outlined" className="space-y-5 rounded-md p-5 sm:p-6">
              <h2 id="add" className="text-xl font-medium">
                {t('冷凍した肉を追加', 'Add frozen meat')}
              </h2>
              <SegmentedControl
                legend={t('動物', 'Animal')}
                orientation="inline"
                value={draft.species}
                onChange={(value) => setDraft({ ...draft, species: value as FreezerSpecies })}
                options={(['deer', 'boar', 'other'] as const).map((value) => ({ value, label: speciesName(value) }))}
              />
              <div className="space-y-2">
                <label htmlFor="freezer-cut" className="block text-sm font-medium">
                  {t('部位・品名', 'Cut or item')}
                </label>
                <input
                  id="freezer-cut"
                  type="text"
                  list="freezer-cuts"
                  value={draft.cut}
                  maxLength={FREEZER_MAX_TEXT}
                  onChange={(event) => setDraft({ ...draft, cut: event.target.value })}
                />
                <datalist id="freezer-cuts">
                  {cutOptions.map((name) => (
                    <option key={name} value={name} />
                  ))}
                </datalist>
              </div>
              <div className="grid grid-cols-2 items-start gap-4">
                <NumberField
                  label={t('1 パックの重さ', 'Weight per pack')}
                  unit="g"
                  min={0}
                  value={draft.gramsPerPack ?? NaN}
                  onChange={(value) => setDraft({ ...draft, gramsPerPack: Number.isNaN(value) ? null : value })}
                  invalid={gramsInvalid}
                  errorText={t('0 以上の数値を入力してください。', 'Enter a number of 0 or more.')}
                  hint={t('任意', 'Optional')}
                />
                <NumberField
                  label={t('パック数', 'Packs')}
                  min={1}
                  step={1}
                  value={draft.packs}
                  onChange={(value) => setDraft({ ...draft, packs: value })}
                  invalid={packsInvalid}
                  errorText={t('1 以上の整数を入力してください。', 'Enter a whole number of 1 or more.')}
                />
              </div>
              <div className="grid grid-cols-2 items-start gap-4">
                <div className="space-y-2">
                  <label htmlFor="freezer-frozen" className="block text-sm font-medium">
                    {t('冷凍した日', 'Frozen on')}
                  </label>
                  <input
                    id="freezer-frozen"
                    type="date"
                    value={draft.frozenOn}
                    onChange={(event) => setDraft({ ...draft, frozenOn: event.target.value })}
                    className="min-h-12 w-full rounded-lg border border-outline bg-background p-3"
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="freezer-use-by" className="block text-sm font-medium">
                    {t('使い切る日（任意）', 'Use by (optional)')}
                  </label>
                  <input
                    id="freezer-use-by"
                    type="date"
                    value={draft.useBy}
                    onChange={(event) => setDraft({ ...draft, useBy: event.target.value })}
                    className="min-h-12 w-full rounded-lg border border-outline bg-background p-3"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label htmlFor="freezer-note" className="block text-sm font-medium">
                  {t('メモ（個体番号など）', 'Note (such as the animal’s number)')}
                </label>
                <input
                  id="freezer-note"
                  type="text"
                  value={draft.note}
                  maxLength={FREEZER_MAX_TEXT}
                  onChange={(event) => setDraft({ ...draft, note: event.target.value })}
                />
              </div>
              <Button onClick={add} disabled={packsInvalid || gramsInvalid}>
                <LuPlus aria-hidden="true" />
                {t('追加する', 'Add')}
              </Button>
              <p role="status" className={notice ? 'text-sm text-on-surface-variant' : 'sr-only'}>
                {notice}
              </p>
            </Card>
          }
          result={
            <Card variant="outlined" className="min-w-0 space-y-5 rounded-md p-5 sm:p-6">
              <div className="space-y-1">
                <h2 id="stock" className="text-xl font-medium">
                  {t('冷凍庫の中身', 'In the freezer')}
                </h2>
                <p className="text-sm text-on-surface-variant">
                  {t(
                    `${number(totals.packs, 0)} パック・${number(totals.grams / 1000, 2)} kg`,
                    `${number(totals.packs, 0)} packs, ${number(totals.grams / 1000, 2)} kg`,
                  )}
                  {totals.unweighedPacks > 0 &&
                    t(
                      `（重さ未入力の ${number(totals.unweighedPacks, 0)} パックを除く）`,
                      ` (leaving out ${number(totals.unweighedPacks, 0)} packs without a weight)`,
                    )}
                </p>
                <p className="text-xs text-on-surface-variant">{t('冷凍した日の古い順', 'Oldest first')}</p>
              </div>
              {sorted.length === 0 ? (
                <p className="text-sm text-on-surface-variant">{t('まだ何もありません。', 'Nothing here yet.')}</p>
              ) : (
                <ul className="space-y-2">
                  {sorted.map((item) => {
                    const frozen = today ? daysFrozen(item, today) : null;
                    const useBy = today ? checkUseBy(item, today) : { kind: 'none' as const };
                    return (
                      <li
                        key={item.id}
                        className={cn(
                          'space-y-2 rounded-sm border p-3 text-sm',
                          useBy.kind === 'past' ? 'border-destructive' : 'border-outline-variant',
                          item.packs === 0 && 'opacity-70',
                        )}
                      >
                        <p className="font-medium">{lineName(item)}</p>
                        <p className="tabular-nums">
                          {t(`${number(item.packs, 0)} パック`, `${number(item.packs, 0)} packs`)}
                          {item.gramsPerPack !== null &&
                            t(` × ${number(item.gramsPerPack, 0)} g`, ` × ${number(item.gramsPerPack, 0)} g`)}
                          {item.frozenOn && t(`・${item.frozenOn} 冷凍`, ` · frozen ${item.frozenOn}`)}
                          {frozen !== null && t(`（${number(frozen, 0)} 日経過）`, ` (${number(frozen, 0)} days)`)}
                        </p>
                        {useBy.kind !== 'none' && (
                          <p className={useBy.kind === 'ahead' ? 'text-on-surface-variant' : 'text-destructive'}>
                            {useBy.kind === 'ahead'
                              ? t(`使い切る日まであと ${useBy.days} 日`, `${useBy.days} days to the use-by date`)
                              : useBy.kind === 'today'
                                ? t('今日が使い切る日です', 'The use-by date is today')
                                : t(
                                    `使い切る日を ${useBy.days} 日過ぎています`,
                                    `${useBy.days} days past the use-by date`,
                                  )}
                          </p>
                        )}
                        {item.note && <p className="text-on-surface-variant">{item.note}</p>}
                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={item.packs === 0}
                            onClick={() => takeOne(item.id)}
                            aria-label={t(
                              `${lineName(item)} を 1 パック取り出す`,
                              `Take one pack of ${lineName(item)}`,
                            )}
                          >
                            <LuMinus aria-hidden="true" />
                            {t('1 パック取り出す', 'Take one')}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label={t(`${lineName(item)} を削除`, `Remove ${lineName(item)}`)}
                            onClick={() => {
                              if (window.confirm(t('この行を削除しますか？', 'Remove this line?'))) removeItem(item.id);
                            }}
                          >
                            <LuTrash2 aria-hidden="true" />
                            {t('削除', 'Remove')}
                          </Button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
              {items.some((item) => item.packs === 0) && (
                <Button variant="outline" onClick={removeEmpty}>
                  {t('0 パックになった行を消す', 'Clear the empty lines')}
                </Button>
              )}
            </Card>
          }
          extras={
            <ConditionSection
              id="storage"
              title={t('保存温度と出典', 'Storage temperature and sources')}
              summary={t(
                `冷凍は −15℃ 以下（${FREEZER_SOURCES_CHECKED_ON} 確認）`,
                `Frozen at −15 °C or below (checked ${FREEZER_SOURCES_CHECKED_ON})`,
              )}
            >
              <div className="space-y-3 text-sm">
                {Object.values(FREEZER_SOURCES).map((source) => (
                  <div key={source.url} className="space-y-1">
                    <blockquote lang="ja" className="border-l-4 border-outline-variant pl-4 text-on-surface-variant">
                      {source.quote}
                    </blockquote>
                    <p>
                      <a href={source.url} target="_blank" rel="noreferrer" className="underline">
                        {source.title}
                      </a>
                      <span className="text-on-surface-variant">　{source.note}</span>
                    </p>
                  </div>
                ))}
                <Button
                  variant="outline"
                  onClick={() => {
                    if (
                      window.confirm(
                        t('すべての行を削除しますか？元に戻せません。', 'Remove every line? This cannot be undone.'),
                      )
                    )
                      deleteAll();
                  }}
                >
                  <LuTrash2 aria-hidden="true" />
                  {t('すべて削除', 'Remove all')}
                </Button>
              </div>
            </ConditionSection>
          }
        />
      </div>
    </AppLayout>
  );
}
