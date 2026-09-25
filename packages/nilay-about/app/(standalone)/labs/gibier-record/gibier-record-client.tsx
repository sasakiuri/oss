'use client';

import { useEffect, useState } from 'react';
import { LuDownload, LuPlus, LuPrinter, LuRefreshCw, LuTrash2 } from 'react-icons/lu';

import {
  AppHeader,
  AppLayout,
  ConditionSection,
  LanguageMenu,
  ResetButton,
  ResultFigure,
  ResultPanel,
  SectionNav,
  ToolLayout,
  useRecordPhotoUrls,
} from '@/components/labs';
import { Button, Card } from '@/components/ui';
import { useDiscardedSave, useStorageStatus } from '@/lib/browser-storage';
import {
  GIBIER_ABNORMALITIES,
  GIBIER_SOURCES,
  GIBIER_SOURCES_CHECKED_ON,
  GIBIER_TEMPERATURE_REFERENCE_C,
  checkGibierAbnormalities,
  checkGibierTemperature,
  formatGibierDateTime,
  formatGibierDuration,
  gibierElapsed,
  gibierRecordInForce,
  hasGibierSetAsideDetails,
  gibierSpeciesText,
  checkGibierAbdominalHit,
  gibierRecordsCsv,
  sortGibierRecords,
} from '@/lib/gibier-record';
import { labsTool } from '@/lib/labs-tools';
import { savedAsShown } from '@/lib/persisted-store';
import { deletePhotosOf, deleteToolPhotos, listPhotos } from '@/lib/photo-storage';
import { GIBIER_ABNORMALITY_KEYS } from '@/lib/schemas/gibier-record';
import { cn } from '@/lib/utils';
import { rehydrateLanguage, useLanguage, useSetLanguage } from '@/store';

import { GIBIER_RECORD_STORAGE_KEY, useGibierRecordStore } from './_store';
import { GibierFindingsGuide } from './gibier-record-findings';
import { GibierRecordForm } from './gibier-record-form';
import { GibierRecordSheet } from './gibier-record-sheet';

const Quote = ({ children }: { children: string }) => (
  <blockquote lang="ja" className="border-l-4 border-outline-variant pl-4 text-on-surface-variant">
    {children}
  </blockquote>
);

/** Before delivery the elapsed time runs to the present, so the figure moves on its own. */
const TICK_MS = 30_000;

export function GibierRecordClient() {
  const records = useGibierRecordStore((state) => state.records);
  const currentId = useGibierRecordStore((state) => state.currentId);
  const { addRecord, selectRecord, deleteRecord, resetCurrent, deleteAll } = useGibierRecordStore.getState();
  const language = useLanguage();
  const setLanguage = useSetLanguage();
  const storageAvailable = useStorageStatus((state) => state.available);
  const discarded = useDiscardedSave(GIBIER_RECORD_STORAGE_KEY);
  const [ready, setReady] = useState(false);
  // Read after mount: the server's clock is not the reader's.
  const [now, setNow] = useState<Date | null>(null);
  const [notice, setNotice] = useState<{ error: boolean; text: string } | null>(null);

  useEffect(() => {
    void Promise.all([useGibierRecordStore.persist.rehydrate(), rehydrateLanguage()]).then(() => setReady(true));
    // Take up the list another tab wrote instead of writing an older copy over it.
    const sync = (event: StorageEvent) => {
      if (event.key !== null && event.key !== GIBIER_RECORD_STORAGE_KEY) return;
      // Rehydrating only reads, so two tabs cannot trigger each other. A deleted list reads back as a
      // blank record (see merge).
      void useGibierRecordStore.persist.rehydrate();
    };
    window.addEventListener('storage', sync);
    const tick = () => setNow(new Date());
    tick();
    const timer = setInterval(tick, TICK_MS);
    return () => {
      window.removeEventListener('storage', sync);
      clearInterval(timer);
    };
  }, []);

  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);
  const record = records.find((item) => item.id === currentId) ?? records[0]!;
  // The checks read what the record says now, not details kept behind an answer switched to 無.
  const inForce = gibierRecordInForce(record);
  const setAside = hasGibierSetAsideDetails(record);
  const sorted = sortGibierRecords(records);
  const abnormalities = checkGibierAbnormalities(record.abnormalities);
  const temperature = checkGibierTemperature(record.species, record.bodyTemperature);
  const delivered = inForce.deliveredAt !== '';
  const elapsed = gibierElapsed(inForce.bleedingStartedAt, delivered ? inForce.deliveredAt : (now ?? ''));
  const abdominal = checkGibierAbdominalHit(record);
  // Bumped when a photo is added or deleted, so the printed sheet reads them again.
  const [photoVersion, setPhotoVersion] = useState(0);
  const photos = useRecordPhotoUrls('gibier-record', record.id, photoVersion);

  const abnormalitySummary =
    abnormalities.status === 'found'
      ? `異常の確認で「はい」が ${abnormalities.found.length} 項目あります。`
      : abnormalities.status === 'clear'
        ? '異常の確認は 11 項目すべて「いいえ」です。'
        : `異常の確認に未回答が ${abnormalities.unanswered.length} 項目あります。`;

  const recordName = (item: typeof record) =>
    [formatGibierDateTime(item.capturedAt) || '捕獲日時未入力', gibierSpeciesText(item) || '獣種未入力'].join('　');

  const startNext = () => {
    addRecord();
    setNotice(null);
    // The blank form starts far above the button, out of sight on a long page.
    document.getElementById('capture')?.scrollIntoView?.();
  };

  /**
   * The photos are kept apart from the records, under the record's id, and are deleted only once the
   * change to the records is on disk: a record that failed to save comes back on the next visit, and
   * its photos must still be there with it.
   */
  const dropPhotosOnceSaved = (deletePhotos: () => Promise<void>, done: string, failed: string) => {
    if (!savedAsShown(useGibierRecordStore)) {
      setNotice({ error: true, text: `${failed}写真は残しています。` });
      return;
    }
    setNotice({ error: false, text: done });
    deletePhotos().then(
      () => setPhotoVersion((value) => value + 1),
      () => setNotice({ error: true, text: `${done}ただし写真を削除できませんでした。` }),
    );
  };

  const printSheet = async () => {
    const images = [...document.querySelectorAll<HTMLImageElement>('[data-gibier-sheet] img')];
    // A picture that cannot be drawn is printed as the browser shows it rather than holding the print.
    await Promise.all(
      images.map((image) => (typeof image.decode === 'function' ? image.decode().catch(() => undefined) : undefined)),
    );
    window.print();
  };

  const exportCsv = async () => {
    // The records are written whatever happens to the photos; only their count is left blank if the
    // photos cannot be read.
    let counts: Map<string, number> | null = new Map();
    try {
      for (const item of sorted) counts.set(item.id, (await listPhotos('gibier-record', item.id)).photos.length);
    } catch {
      counts = null;
    }
    const blob = new Blob([gibierRecordsCsv(sorted, counts)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const today = new Date();
    const pad = (value: number) => String(value).padStart(2, '0');
    link.href = url;
    link.download = `gibier-records-${today.getFullYear()}${pad(today.getMonth() + 1)}${pad(today.getDate())}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    setNotice(
      counts === null
        ? {
            error: true,
            text: `${records.length} 頭分の記録を CSV で書き出しました。写真をこのブラウザーから読み取れなかったため、写真の枚数は空欄です。`,
          }
        : { error: false, text: `${records.length} 頭分の記録を CSV で書き出しました。` },
    );
  };

  const discardedText = t(
    '保存されていた記録の一部または全部を読み取れなかったため、読み取れた記録だけで開いています。',
    'Some or all saved records could not be read. Only the readable ones were opened.',
  );

  return (
    <AppLayout
      header={
        <AppHeader
          className="print:hidden"
          title={labsTool('gibier-record').title[language]}
          actions={
            <>
              <ResetButton
                language={language}
                description={{
                  ja: '表示中の 1 頭の入力をすべて空にします。一覧のほかの記録は残ります。',
                  en: 'Clears the record on screen. Other records in the list are kept.',
                }}
                onReset={() => {
                  resetCurrent();
                  dropPhotosOnceSaved(
                    () => deletePhotosOf('gibier-record', record.id),
                    '表示中の記録を空にしました。',
                    '表示中の記録を空にできなかった可能性があります。',
                  );
                }}
              />
              <LanguageMenu language={language} onLanguageChange={setLanguage} />
            </>
          }
        />
      }
      nav={
        <SectionNav
          language={language}
          sections={[
            { id: 'capture', label: t('捕獲', 'Capture') },
            { id: 'animal', label: t('異常の確認', 'Checks on the animal') },
            { id: 'bleeding', label: t('止め刺し・放血', 'Kill and bleeding') },
            { id: 'delivery', label: t('内臓・冷却・搬入', 'Gutting and delivery') },
            { id: 'photos', label: t('写真', 'Photos') },
            { id: 'checks', label: t('印刷', 'Print') },
            { id: 'records', label: t('記録の一覧', 'Records') },
            { id: 'findings', label: t('異常の見分け方', 'Abnormal findings') },
          ]}
        />
      }
    >
      {/* Mounted empty so later text is announced; kept separate because status regions are atomic. */}
      <p className="sr-only" role="status" lang={language}>
        {discarded ? discardedText : ''}
      </p>
      <p className="sr-only" role="status" lang="ja">
        {ready ? abnormalitySummary : ''}
      </p>
      <div lang={language} className="space-y-6 print:hidden" inert={!ready} aria-busy={!ready}>
        {discarded && (
          <p lang={language} className="text-sm text-on-surface-variant">
            {discardedText}
          </p>
        )}
        {language === 'en' && (
          <p lang="en" className="rounded-sm bg-surface-container p-4 text-sm">
            Japanese only. The fields follow a Japanese record form and guideline.
          </p>
        )}
        {!storageAvailable && (
          <p lang="ja" role="status" className="text-sm text-on-surface-variant">
            このブラウザーでは保存できません。ページを離れると記録は消えるので、印刷して残してください。
          </p>
        )}
        <ToolLayout
          resultLabel={t('確認と印刷', 'Checks and printing')}
          primary={
            <div lang="ja" className="space-y-6">
              <GibierRecordForm record={record} onPhotosChange={() => setPhotoVersion((value) => value + 1)} />
            </div>
          }
          result={
            <Card lang="ja" variant="outlined" className="min-w-0 space-y-5 rounded-md p-5 sm:p-6">
              <div className="space-y-1">
                <h2 id="checks" className="text-xl font-medium">
                  確認と印刷
                </h2>
                <p className="text-sm text-on-surface-variant">表示中：{recordName(record)}</p>
              </div>
              <ResultPanel>
                <ResultFigure
                  size="lead"
                  label="異常の確認（11 項目）"
                  value={
                    abnormalities.status === 'found'
                      ? `「はい」${abnormalities.found.length} 項目`
                      : abnormalities.status === 'clear'
                        ? 'すべて「いいえ」'
                        : `未回答 ${abnormalities.unanswered.length} 項目`
                  }
                  tone={abnormalities.status === 'found' ? 'bad' : 'neutral'}
                  note={
                    abnormalities.status === 'found' && abnormalities.unanswered.length > 0
                      ? `未回答 ${abnormalities.unanswered.length} 項目`
                      : undefined
                  }
                />
                <ResultFigure
                  label={delivered ? '放血開始から搬入まで' : '放血開始から現在まで'}
                  value={elapsed.kind === 'ok' ? formatGibierDuration(elapsed.minutes) : '—'}
                  note={
                    elapsed.kind === 'reversed'
                      ? delivered
                        ? '搬入日時が放血の開始日時より前です。日時を確認してください。'
                        : '放血の開始日時が現在より後です。日時を確認してください。'
                      : elapsed.kind === 'missing'
                        ? undefined
                        : '搬入前に搬入予定時刻を施設に伝えてください（ガイドライン 第 3（2））。'
                  }
                />
              </ResultPanel>

              {abnormalities.status === 'found' && (
                <div
                  role="alert"
                  className="space-y-3 rounded-sm bg-error-container p-4 text-sm text-on-error-container"
                >
                  <p>「はい」と記録した項目：</p>
                  <ul className="list-disc space-y-1 pl-5">
                    {abnormalities.found.map((key) => (
                      <li key={key}>
                        {GIBIER_ABNORMALITIES[key].letter}　{GIBIER_ABNORMALITIES[key].form}
                      </li>
                    ))}
                  </ul>
                  {abnormalities.found.includes('wound') && (
                    <p>
                      ガイドラインの ト は「{GIBIER_ABNORMALITIES.wound.guideline}
                      」です（化膿部位、皮膚の炎症、かさぶたは様式 2 が追加）。
                    </p>
                  )}
                  <p>様式 2 の注意事項：「異常が認められた個体は、全部破棄してください。」</p>
                  <p>ガイドライン 第 2 の 2（1）：</p>
                  <blockquote className="border-l-4 border-current pl-4">
                    捕獲しようとする又は捕獲した野生鳥獣（捕獲後に飼養した個体を含む）の外見及び挙動に以下に掲げる異常が一つでも見られる場合は、食用に供してはならない。
                  </blockquote>
                </div>
              )}

              {(temperature.kind === 'atOrAbove' || record.palpation === 'high' || record.palpation === 'low') && (
                <div className="space-y-2 rounded-sm bg-error-container p-4 text-sm text-on-error-container">
                  {temperature.kind === 'atOrAbove' && (
                    <p>
                      測定した体温 {temperature.value}℃ は、手引書が示す目安（
                      {record.species === 'boar' ? 'イノシシ' : 'シカ'} {temperature.reference}
                      ℃）以上です。手引書は「イノシシは 42℃、シカは 40℃以上の場合は解体しない」としています。
                    </p>
                  )}
                  {(record.palpation === 'high' || record.palpation === 'low') && (
                    <p>
                      触診で「{record.palpation === 'high' ? '高温' : '低温'}」と記録しています。様式 2
                      の注意事項：「異常に高い体温や低い体温の個体は食用にはできません」
                    </p>
                  )}
                  <p>
                    ガイドライン 第 2 の
                    3（7）：「放血後、血液の性状を観察するとともに、足の付け根等に触れることにより、速やかに体温を調べ、異常を認めた個体は、食用に供さないこと。」
                  </p>
                </div>
              )}
              {temperature.kind === 'noReference' && (
                <p className="text-sm text-on-surface-variant">
                  手引書の体温の目安はイノシシ {GIBIER_TEMPERATURE_REFERENCE_C.boar}℃・シカ{' '}
                  {GIBIER_TEMPERATURE_REFERENCE_C.deer}℃ だけです。
                </p>
              )}
              {abdominal === 'bullet' && (
                <p className="rounded-sm bg-error-container p-4 text-sm text-on-error-container">
                  銃を使った個体で、部位に「腹部」が選ばれています。ガイドライン 第 2 の
                  1（1）ロ：「腹部に着弾した個体は、食用に供さないこと」
                </p>
              )}
              {abdominal === 'unclear' && (
                <p className="rounded-sm bg-surface-container p-4 text-sm">
                  部位に「腹部」が選ばれています。止め刺しに銃を使ったかどうかを記録してください（ガイドライン 第 2 の
                  1（1）ロ「腹部に着弾した個体は、食用に供さないこと」）。
                </p>
              )}
              {setAside && (
                <p role="note" className="rounded-sm bg-surface-container p-4 text-sm">
                  「無」などに切り替えた項目の詳細は、印刷と確認に含めていません。
                </p>
              )}

              <div className="space-y-2">
                {/* The photos are read from the browser's storage after the record; the sheet is printed
                    only once they are there and drawn, so none is left off the paper. */}
                <Button className="w-full" disabled={!photos.ready} onClick={() => void printSheet()}>
                  <LuPrinter aria-hidden="true" />
                  {photos.ready
                    ? 'この 1 頭を印刷する'
                    : photos.failed
                      ? '写真を読み込めませんでした'
                      : '写真を読み込んでいます…'}
                </Button>
                {photos.failed && (
                  <div className="space-y-2 rounded-sm bg-error-container p-4 text-sm text-on-error-container">
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" size="sm" onClick={() => setPhotoVersion((value) => value + 1)}>
                        <LuRefreshCw aria-hidden="true" />
                        写真を読み込み直す
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => void printSheet()}>
                        <LuPrinter aria-hidden="true" />
                        写真なしで印刷する
                      </Button>
                    </div>
                  </div>
                )}
                <p className="text-xs text-on-surface-variant">
                  A4 縦。記録者・衛生管理者・受入の可否・受入個体管理番号の欄は施設が記入します。
                </p>
              </div>
              <div className="space-y-2">
                <Button variant="secondary" className="w-full" onClick={startNext}>
                  <LuPlus aria-hidden="true" />
                  次の 1 頭を記録する
                </Button>
                <p className="text-xs text-on-surface-variant">捕獲者名と狩猟免許番号は引き継ぎます。</p>
              </div>
            </Card>
          }
          secondary={
            <>
              <Card lang="ja" variant="outlined" className="space-y-4 rounded-md p-5 sm:p-6">
                <h2 id="records" className="text-xl font-medium">
                  記録の一覧（{records.length} 頭）
                </h2>
                <ul className="space-y-2">
                  {sorted.map((item) => {
                    const current = item.id === record.id;
                    const status = checkGibierAbnormalities(item.abnormalities).status;
                    return (
                      <li
                        key={item.id}
                        className={cn(
                          'flex flex-wrap items-center gap-2 rounded-sm border p-3',
                          current ? 'border-primary' : 'border-outline-variant',
                        )}
                      >
                        <span className="min-w-0 flex-1 text-sm">
                          <span className="block">{recordName(item)}</span>
                          <span className="block text-xs text-on-surface-variant">
                            {status === 'found'
                              ? '異常「はい」あり'
                              : status === 'clear'
                                ? '異常 11 項目「いいえ」'
                                : '異常の確認に未回答あり'}
                            {current && '（表示中）'}
                          </span>
                        </span>
                        {!current && (
                          <Button variant="outline" size="sm" onClick={() => selectRecord(item.id)}>
                            開く
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`${recordName(item)} の記録を削除`}
                          onClick={() => {
                            if (!window.confirm(`${recordName(item)} の記録を削除しますか？元に戻せません。`)) return;
                            deleteRecord(item.id);
                            dropPhotosOnceSaved(
                              () => deletePhotosOf('gibier-record', item.id),
                              '記録を削除しました。',
                              '記録を削除できなかった可能性があります。',
                            );
                          }}
                        >
                          <LuTrash2 aria-hidden="true" />
                          削除
                        </Button>
                      </li>
                    );
                  })}
                </ul>
                <div className="space-y-1">
                  <Button
                    variant="outline"
                    className="h-auto min-h-10 max-w-full whitespace-normal"
                    onClick={() => void exportCsv()}
                  >
                    <LuDownload aria-hidden="true" />
                    すべての記録を CSV で書き出す
                  </Button>
                  <p className="text-xs text-on-surface-variant">1 頭 1 行、UTF-8（BOM 付き）。写真は含みません。</p>
                </div>
                {/* Mounted from the start and empty until there is something to say, so the first message is read out. */}
                <p
                  lang="ja"
                  role="status"
                  aria-live={notice?.error ? 'assertive' : 'polite'}
                  className={notice ? `text-sm ${notice.error ? 'text-destructive' : ''}` : 'sr-only'}
                >
                  {notice?.text ?? ''}
                </p>
              </Card>
              <ConditionSection
                id="saving"
                title="この端末への保存"
                summary={
                  storageAvailable ? '記録表の保存期間と、共用の端末での削除' : 'このブラウザーでは保存できません。'
                }
              >
                <div lang="ja" className="space-y-3 text-sm text-on-surface-variant">
                  <p>
                    記録の氏名、狩猟免許番号、捕獲場所、写真は、同じブラウザーを使う人なら見られます。共用の端末では、印刷後に「すべての記録を削除」で消してください。
                  </p>
                  <p>
                    記録表は 1 年以上（冷凍品は 2 年間）保存します（様式 2
                    の注意事項）。ブラウザーの記録は消えることがあるため、印刷した紙で保管します。
                  </p>
                </div>
                <Button
                  variant="outline"
                  onClick={() => {
                    if (!window.confirm('この端末に保存したすべての記録を削除しますか？元に戻せません。')) return;
                    // The removal answers for itself; only once it landed are the photos deleted.
                    if (!deleteAll()) {
                      setNotice({
                        error: true,
                        text: '記録を削除できなかった可能性があります。写真は残しています。ブラウザーの設定から、このサイトのデータを削除してください。',
                      });
                      return;
                    }
                    setNotice({ error: false, text: 'すべての記録を削除しました。' });
                    deleteToolPhotos('gibier-record').then(
                      () => setPhotoVersion((value) => value + 1),
                      () =>
                        setNotice({ error: true, text: 'すべての記録を削除しましたが、写真を削除できませんでした。' }),
                    );
                  }}
                >
                  <LuTrash2 aria-hidden="true" />
                  すべての記録を削除
                </Button>
              </ConditionSection>
            </>
          }
          extras={
            <div lang="ja" className="space-y-6">
              <GibierFindingsGuide species={record.species} />
              <ConditionSection
                id="basis"
                title="根拠"
                summary={`厚生労働省のガイドラインと、同省掲載の手引書の様式 2（${GIBIER_SOURCES_CHECKED_ON} 確認）`}
              >
                <div className="space-y-3 text-sm">
                  <p className="text-on-surface-variant">
                    項目は、ガイドライン 第 3（6）が捕獲者に記録・伝達・保存を求める次の情報と、手引書の様式
                    2「捕獲・受入個体記録表（日報）」の欄によります。
                  </p>
                  <Quote>
                    イ 捕獲者の氏名及び免許番号　ロ 捕獲者の健康状態　ハ 捕獲した日時、場所、天候等　ニ 捕獲方法　ホ
                    被弾部位、くくりわなのかかり部位、止め刺しの部位・方法等　ヘ 損傷の有無や部位　ト
                    第２の２（１）に掲げる異常の確認結果　チ 推定年齢、性別及び推定体重　リ
                    放血の有無、方法、場所及び体温の異常の有無　ヌ
                    内臓摘出の有無、方法、場所、内臓、臭気の異常の有無等　ル
                    運搬時の冷却の有無、冷却開始時刻及び冷却方法　ヲ
                    放血後から食肉処理施設に搬入されるまでにかかった時間
                  </Quote>
                  <p className="text-on-surface-variant">
                    異常の確認は様式 2 の文言です。様式 2 は ト
                    に化膿部位、皮膚の炎症、かさぶたを加えています。ガイドライン 第 2 の 2（1）の原文：
                  </p>
                  <ul
                    lang="ja"
                    className="list-none space-y-1 border-l-4 border-outline-variant pl-4 text-on-surface-variant"
                  >
                    {GIBIER_ABNORMALITY_KEYS.map((key) => (
                      <li key={key}>
                        {GIBIER_ABNORMALITIES[key].letter}　{GIBIER_ABNORMALITIES[key].guideline}
                      </li>
                    ))}
                  </ul>
                  <p className="text-on-surface-variant">
                    ※ の項目（止め刺しの方法、銃の使用、内臓摘出の方法、内臓・臭気の異常）は様式 2 に欄がなく、上の
                    ホ・ヌ に基づいて加えています。
                  </p>
                  <p className="text-on-surface-variant">第 2 の 2（3）（4）：</p>
                  <Quote>（３）既に死亡している野生鳥獣は食用に供してはならない。</Quote>
                  <Quote>
                    （４）（１）の項目に該当しないことを確認した記録を作成し、食肉処理業者に伝達するとともに、適切な期間保存すること。
                  </Quote>
                  <p className="text-on-surface-variant">
                    搬入までの時間は、第
                    3（4）が「運搬に係る時間、方法が不適切と認められた場合にあっては、食用に供さないこと」とし、上限の数値は定めていません。受入の条件は搬入先の施設に確認してください。
                  </p>
                  <p className="text-on-surface-variant">
                    体温の目安（イノシシ 42℃、シカ 40℃）は、ガイドラインではなく手引書の値です（様式 2
                    の注意事項「異常温度の目安：猪 42℃、鹿 40℃」、衛生管理方法の「放血」の項）。
                  </p>
                  <p className="text-on-surface-variant">
                    家畜伝染病の発生状況による扱い（第 2 の 2（2））は、地域の情報を確認してください。
                  </p>
                  <ul className="list-disc space-y-2 pl-5">
                    {Object.values(GIBIER_SOURCES).map((source) => (
                      <li key={source.url}>
                        <a href={source.url} target="_blank" rel="noreferrer" className="underline">
                          {source.name}
                        </a>
                        <span className="text-on-surface-variant">　{source.note}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </ConditionSection>
            </div>
          }
        />
      </div>
      <GibierRecordSheet record={record} photoUrls={photos.urls.map((photo) => photo.url)} />
    </AppLayout>
  );
}
