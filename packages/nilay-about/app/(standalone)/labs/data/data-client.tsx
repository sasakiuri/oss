'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { LuDownload, LuUpload } from 'react-icons/lu';

import { AppHeader, AppLayout, LanguageMenu } from '@/components/labs';
import { Button, Card } from '@/components/ui';
import { downloadBlob } from '@/lib/download';
import {
  BACKUP_FILE_EXTENSION,
  BACKUP_MAX_BYTES,
  type BackupPart,
  type ImportPlan,
  type RejectReason,
} from '@/lib/labs-backup';
import { enterDataPage } from '@/lib/labs-session';
import { labsTool, labsTools } from '@/lib/labs-tools';
import { persistedKey } from '@/lib/persisted-store';
import { rehydrateLanguage, useLanguage, useSetLanguage, type Language } from '@/store';

import {
  applyRestore,
  collectBackup,
  planRestore,
  abandonInterruptedRestore,
  recoverInterruptedRestore,
  retryInterruptedRestore,
  type BackupSummary,
  type RecoveryResult,
  type RestoreResult,
} from './backup';
import { savedDataEntry, type SavedDataEntry } from './saved-data';

type Wording = [ja: string, en: string];

const toolTitle = (slug: string, language: Language) =>
  labsTools.find((tool) => tool.slug === slug)?.title[language] ?? slug;

function entryName(entry: SavedDataEntry, language: Language): string {
  if (entry.part === 'shared') return entry.title[language];
  const title = labsTool(entry.slug).title[language];
  if (entry.part === 'main') return title;
  if (entry.part === 'extra')
    return language === 'ja' ? `${title}（${entry.title.ja}）` : `${title} (${entry.title.en})`;
  return language === 'ja' ? `${title}（名前を付けて保存した設定）` : `${title} (named settings)`;
}

function partName(part: BackupPart, language: Language): string {
  if (part.kind === 'hunter-map') return labsTool('hunter-map').title[language];
  if (part.kind === 'photos')
    return language === 'ja'
      ? `${toolTitle(part.tool, language)}の写真`
      : `Photos in ${toolTitle(part.tool, language)}`;
  const entry = savedDataEntry(part.key);
  return entry ? entryName(entry, language) : part.key;
}

const partKey = (part: BackupPart) =>
  part.kind === 'storage' ? `s:${part.key}` : part.kind === 'photos' ? `p:${part.tool}` : 'map';

const reasonText: Record<RejectReason, Wording> = {
  unknown: ['Labs のどのツールのデータでもありません', 'Not saved by any Labs tool'],
  invalid: [
    'ツールの保存形式に合わないか、ファイルが途中で切れています',
    'Does not match what the tool saves, or the file is cut short',
  ],
  'records-rejected': [
    '記録本体を読み込めないため、写真も読み込みません',
    'Its records cannot be read, so neither can its photos',
  ],
};

const notStartedText: Record<Extract<RestoreResult, { state: 'not-started' }>['reason'], Wording> = {
  unreadable: [
    'この端末のデータを読み取れず、元に戻せる控えを作れないため、何も読み込んでいません。',
    'The data on this device could not be read to keep a copy to go back to, so nothing was restored.',
  ],
  unwritable: [
    '読み込みの控えを端末に保存できないため、何も読み込んでいません。端末の空き容量を確認してください。',
    'The note that lets a restore be undone could not be saved, so nothing was restored. Check the free space on this device.',
  ],
  'other-tabs': [
    'ほかのタブで Labs のページが開いているため、読み込んでいません。ほかの Labs のタブを閉じてから、もう一度お試しください。',
    'A Labs page is open in another tab, so nothing was restored. Close the other Labs tabs, then try again.',
  ],
  unsupported: [
    'このブラウザーでは複数のタブの読み込みを整理できないため、読み込めません。ブラウザーを更新してください。',
    'This browser cannot keep tabs from restoring at the same time, so nothing was restored. Update the browser.',
  ],
  interrupted: [
    '前回途中で止まった読み込みを元に戻せないため、何も読み込んでいません。ページを再読み込みしてからもう一度お試しください。',
    'A restore cut short earlier could not be undone, so nothing was restored. Reload the page and try again.',
  ],
};

const recoveryText: Partial<Record<RecoveryResult, Wording>> = {
  undone: [
    '前回の読み込みが途中で止まっていたため、読み込む前のデータに戻しました。',
    'A restore had been cut short, so the data was put back as it was before it.',
  ],
  failed: [
    '前回途中で止まった読み込みを元に戻せていません。解決するまで、ツールは保存せずに開きます。もう一度元に戻すか、控えを削除して今のデータのまま使うかを選んでください（ほかの Labs のタブを閉じてから）。',
    'A restore cut short earlier has not been undone. Until it is, the tools open without saving. Try undoing it again, or delete its note and keep the data as it is now (close the other Labs tabs first).',
  ],
  waiting: [
    '前回途中で止まった読み込みが残っています。ほかの Labs のタブを閉じてから、このページを再読み込みしてください。',
    'A restore cut short earlier is still to be undone. Close the other Labs tabs, then reload this page.',
  ],
};

/** Today on the reader's own calendar, for the file name. */
function localDate(now: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

const megabytes = (bytes: number) => Math.ceil(bytes / 1024 / 1024);

export function LabsDataClient() {
  const language = useLanguage();
  const setLanguage = useSetLanguage();
  const [ready, setReady] = useState(false);
  const fileId = useId();
  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);

  const [recovery, setRecovery] = useState<RecoveryResult>('none');
  const [exporting, setExporting] = useState(false);
  const [exported, setExported] = useState<BackupSummary | null>(null);
  const [exportProblem, setExportProblem] = useState<Wording | null>(null);

  const [chosen, setChosen] = useState<{ file: File; plan: ImportPlan } | null>(null);
  const [checking, setChecking] = useState(false);
  const [fileError, setFileError] = useState<Wording | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<RestoreResult | null>(null);
  // Remounts the file field, so the same file can be chosen again after a cancel or a restore.
  const [fileField, setFileField] = useState(0);
  // Which choice of file is the current one. Checking a large file takes a while, and one chosen
  // earlier must not put its plan on screen after a later choice.
  const choice = useRef(0);
  const plan = chosen?.plan ?? null;

  // This page restores, so it holds none of the lock other Labs pages hold while open (labs-session.ts).
  useEffect(() => enterDataPage(), []);

  useEffect(() => {
    // A restore cut short (the tab closed partway) is settled before anything else is done here.
    void Promise.all([rehydrateLanguage(), recoverInterruptedRestore().then(setRecovery)]).then(() => setReady(true));
  }, []);

  const exportAll = async () => {
    setExporting(true);
    setExportProblem(null);
    setExported(null);
    try {
      const now = new Date();
      const collected = await collectBackup(now);
      if (collected.state === 'ready') {
        downloadBlob(collected.blob, `nilay-labs-backup-${localDate(now)}${BACKUP_FILE_EXTENSION}`);
        setExported(collected.summary);
      } else if (collected.state === 'too-large')
        setExportProblem([
          `ファイルが約 ${megabytes(collected.bytes)} MB になり、読み込める ${megabytes(BACKUP_MAX_BYTES)} MB を超えるため書き出していません。使わない写真や地図を削除してから書き出してください。`,
          `The file would be about ${megabytes(collected.bytes)} MB, over the ${megabytes(BACKUP_MAX_BYTES)} MB that can be read back, so it was not written. Delete photos or maps you no longer need, then export again.`,
        ]);
      else if (collected.state === 'interrupted')
        setExportProblem([
          '途中で止まった読み込みが解決していないため、書き出していません。',
          'A restore cut short has not been settled, so nothing was exported.',
        ]);
      else
        setExportProblem([
          '書き出している間にデータが変わったため、書き出していません。もう一度お試しください。',
          'The data changed while the file was being made, so it was not written. Try again.',
        ]);
    } catch {
      setExportProblem(['書き出せませんでした。', 'The export failed.']);
    } finally {
      setExporting(false);
    }
  };

  const chooseFile = async (file: File | undefined) => {
    const current = (choice.current += 1);
    const latest = () => current === choice.current;
    setChosen(null);
    setResult(null);
    setFileError(null);
    if (!file) return;
    if (file.size > BACKUP_MAX_BYTES) {
      setFileError([
        `ファイルが大きすぎます（${megabytes(BACKUP_MAX_BYTES)} MB まで）。`,
        `The file is too large (up to ${megabytes(BACKUP_MAX_BYTES)} MB).`,
      ]);
      return;
    }
    setChecking(true);
    try {
      // Read a slice at a time and checked as it goes, pictures included, so the file is never held whole.
      const read = await planRestore(file);
      if (!latest()) return;
      if (read.ok) setChosen({ file, plan: read.plan });
      else
        setFileError(
          read.error === 'not-json'
            ? ['Labs のバックアップファイルではありません。', 'This is not a Labs backup file.']
            : [
                'Labs で書き出したファイルではないか、対応していない形式です。',
                'This is not a file exported from Labs, or it is in a format this page does not read.',
              ],
        );
    } catch {
      if (latest()) setFileError(['ファイルを読み込めませんでした。', 'The file could not be read.']);
    } finally {
      if (latest()) setChecking(false);
    }
  };

  const restorable = (value: ImportPlan) => value.storage.length + (value.hunterMap ? 1 : 0) + value.photos.length > 0;

  const restore = async () => {
    if (!chosen) return;
    if (
      !window.confirm(
        t(
          'ファイルに含まれるツールのデータを、この端末のデータと置き換えます。元に戻せません。読み込みますか？',
          'The data of each tool in the file will replace that tool’s data on this device. This cannot be undone. Restore?',
        ),
      )
    )
      return;
    setImporting(true);
    try {
      setResult(await applyRestore(chosen.file, chosen.plan));
      setChosen(null);
      setFileField((value) => value + 1);
    } finally {
      setImporting(false);
    }
  };

  const plannedParts = (value: ImportPlan): BackupPart[] => [
    ...value.storage.map(({ key }) => ({ kind: 'storage', key }) as const),
    ...(value.hunterMap ? [{ kind: 'hunter-map' } as const] : []),
    ...value.photos.map(({ tool }) => ({ kind: 'photos', tool }) as const),
  ];

  const plannedNote = (value: ImportPlan, part: BackupPart): string => {
    if (part.kind === 'hunter-map' && value.hunterMap?.action === 'clear')
      return t(
        '（ファイルに地図がないため、この端末の地図を削除します）',
        ' (the file has no maps, so the maps on this device are deleted)',
      );
    if (part.kind === 'hunter-map' && value.hunterMap?.action === 'replace')
      return t(`（地図 ${value.hunterMap.setups.length} 枚）`, ` (${value.hunterMap.setups.length} maps)`);
    if (part.kind === 'photos') {
      const count = value.photos.find((group) => group.tool === part.tool)?.count ?? 0;
      return count === 0
        ? t(
            '（ファイルに写真がないため、この端末の写真を削除します）',
            ' (the file has none, so those on this device are deleted)',
          )
        : t(`（${count} 枚）`, ` (${count})`);
    }
    return '';
  };

  const exportSummary = (): Wording[] => {
    if (!exported) return [];
    const lines: Wording[] = [
      [
        `${exported.included.length} 件のツールのデータを書き出しました。`,
        `Exported the data of ${exported.included.length} tool${exported.included.length === 1 ? '' : 's'}.`,
      ],
    ];
    if (typeof exported.maps === 'number' && exported.maps > 0)
      lines.push([`狩猟マップの地図 ${exported.maps} 枚を含みます。`, `Includes ${exported.maps} hunter maps.`]);
    if (typeof exported.photos === 'number' && exported.photos > 0)
      lines.push([`写真 ${exported.photos} 枚を含みます。`, `Includes ${exported.photos} photos.`]);
    if (exported.mapsLeftOut > 0)
      lines.push([
        `読み取れなかった地図 ${exported.mapsLeftOut} 枚は含めていません。`,
        `${exported.mapsLeftOut} maps that could not be read are not included.`,
      ]);
    if (exported.photosLeftOut > 0)
      lines.push([
        `読み取れない写真や、記録が削除された写真 ${exported.photosLeftOut} 枚は含めていません。`,
        `${exported.photosLeftOut} photos that could not be read or whose record is gone are not included.`,
      ]);
    if (exported.maps === 'unavailable' || exported.photos === 'unavailable')
      lines.push([
        'このブラウザーでは地図と写真の保存領域を開けなかったため、含めていません。',
        'The storage for maps and photos could not be opened in this browser, so they are not included.',
      ]);
    return lines;
  };

  const recoveryNotice = recoveryText[recovery];

  return (
    <AppLayout
      header={
        <AppHeader
          title={t('データの書き出し・読み込み', 'Back up and restore')}
          actions={<LanguageMenu language={language} onLanguageChange={setLanguage} />}
        />
      }
    >
      <div lang={language} className="mx-auto max-w-3xl space-y-6" inert={!ready} aria-busy={!ready}>
        <p>
          {t(
            'Labs のツールがこのブラウザーに保存した入力・記録・名前付きの設定・狩猟マップ・写真を 1 つのファイルに書き出し、別の端末やブラウザーで読み込んで元に戻せます。',
            'Save everything the Labs tools keep in this browser (inputs, records, named settings, the hunter maps and photos) to one file, and read it back on another device or browser.',
          )}
        </p>
        <div role="status" className={recoveryNotice ? 'space-y-2 text-sm' : 'sr-only'}>
          {recoveryNotice && <p>{t(...recoveryNotice)}</p>}
          {recovery === 'failed' && (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => void retryInterruptedRestore().then(setRecovery)}>
                {t('もう一度元に戻す', 'Try undoing it again')}
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  if (
                    window.confirm(
                      t(
                        '途中で止まった読み込みの控えを削除し、今のデータのまま使いますか？一部のツールだけが読み込まれた状態のままになることがあります。',
                        'Delete the note of the restore and keep the data as it is now? Some tools may stay restored and others not.',
                      ),
                    )
                  )
                    void abandonInterruptedRestore().then(setRecovery);
                }}
              >
                {t('控えを削除して今のデータを使う', 'Delete the note and keep the data as it is')}
              </Button>
            </div>
          )}
        </div>

        <Card variant="outlined" className="space-y-4 rounded-md p-5 sm:p-6">
          <h2 className="text-xl font-medium">{t('書き出す', 'Export')}</h2>
          <p className="text-sm text-on-surface-variant">
            {t(
              'ファイルは暗号化されません。記録の場所・位置や写真を含むことがあるので、渡す相手と保管場所に注意してください。',
              'The file is not encrypted. It can hold places, positions and photos, so take care where you keep it and who you give it to.',
            )}
          </p>
          <Button onClick={() => void exportAll()} disabled={exporting}>
            <LuDownload aria-hidden="true" />
            {exporting ? t('書き出しています…', 'Exporting…') : t('ファイルに書き出す', 'Export to a file')}
          </Button>
          <div role="status" className={exported || exportProblem ? 'space-y-1 text-sm' : 'sr-only'}>
            {exportProblem && <p className="text-destructive">{t(...exportProblem)}</p>}
            {exportSummary().map((line) => (
              <p key={line[1]}>{t(...line)}</p>
            ))}
            {exported && exported.unreadable.length > 0 && (
              <>
                <p>
                  {t(
                    '次のツールの保存データは読み取れなかったため、含めていません。',
                    'The saved data of these tools could not be read and is not included:',
                  )}
                </p>
                <ul className="list-disc pl-6">
                  {exported.unreadable.map((entry) => (
                    <li key={persistedKey(entry.store)}>{entryName(entry, language)}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </Card>

        <Card variant="outlined" className="space-y-4 rounded-md p-5 sm:p-6">
          <h2 className="text-xl font-medium">{t('読み込む', 'Restore')}</h2>
          <p className="text-sm text-on-surface-variant">
            {t(
              'ファイルに含まれるツールのデータは、この端末のデータと置き換わります。含まれないツールのデータはそのまま残ります。ほかの Labs のタブは閉じてから読み込んでください。',
              'Each tool in the file replaces that tool’s data on this device; tools not in the file are left as they are. Close any other Labs tabs before restoring.',
            )}
          </p>
          <div className="space-y-2">
            <label htmlFor={fileId} className="block text-sm font-medium">
              {t('書き出したバックアップファイル', 'Exported backup file')}
            </label>
            <input
              key={fileField}
              id={fileId}
              type="file"
              accept={`${BACKUP_FILE_EXTENSION},application/x-ndjson`}
              onChange={(event) => void chooseFile(event.target.files?.[0])}
            />
          </div>
          <div role="status" className="space-y-3 text-sm">
            {checking && <p>{t('ファイルを確認しています…', 'Checking the file…')}</p>}
            {fileError && <p className="text-destructive">{t(...fileError)}</p>}
            {plan && (
              <>
                <p>
                  {t(
                    `${new Date(plan.exportedAt).toLocaleString('ja-JP')} に書き出したファイルです。`,
                    `Exported on ${new Date(plan.exportedAt).toLocaleString('en-GB')}.`,
                  )}
                </p>
                {restorable(plan) ? (
                  <>
                    <p>{t('次のデータを読み込みます。', 'This will be restored:')}</p>
                    <ul className="list-disc pl-6">
                      {plannedParts(plan).map((part) => (
                        <li key={partKey(part)}>
                          {partName(part, language)}
                          {plannedNote(plan, part)}
                        </li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <p>{t('読み込めるデータがありません。', 'Nothing in the file can be restored.')}</p>
                )}
                {plan.notIncluded.length > 0 && (
                  <p>
                    {t(
                      '書き出したときに読み取れなかった地図・写真はファイルに含まれていないため、この端末の地図・写真はそのまま残します。',
                      'The maps or photos could not be read when the file was made, so those on this device are left as they are.',
                    )}
                  </p>
                )}
                {plan.rejected.length > 0 && (
                  <>
                    <p>{t('次のデータは読み込みません。', 'This will not be restored:')}</p>
                    <ul className="list-disc pl-6">
                      {plan.rejected.map(({ part, reason }) => (
                        <li key={partKey(part)}>
                          {partName(part, language)}
                          {t('：', ': ')}
                          {t(...reasonText[reason])}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </>
            )}
            {result?.state === 'restored' && (
              <p>
                {t(
                  `${result.parts.length} 件のデータを読み込みました。`,
                  `Restored ${result.parts.length} item${result.parts.length === 1 ? '' : 's'}.`,
                )}
              </p>
            )}
            {result?.state === 'not-started' && (
              <p className="text-destructive">{t(...notStartedText[result.reason])}</p>
            )}
            {result?.state === 'rolled-back' && (
              <p className="text-destructive">
                {t(
                  `「${partName(result.failed, language)}」を書き込めなかったため、読み込みを取り消して元のデータに戻しました（端末の空き容量を確認してください）。`,
                  `“${partName(result.failed, language)}” could not be written, so the restore was undone and the data on this device is as it was (check the free space on this device).`,
                )}
              </p>
            )}
            {result?.state === 'rollback-failed' && (
              <>
                <p className="text-destructive">
                  {t(
                    `「${partName(result.failed, language)}」を書き込めず、次のデータは元に戻せなかった可能性があります。各ツールを開いて確認してください。`,
                    `“${partName(result.failed, language)}” could not be written, and these may not have been put back. Open each tool to check:`,
                  )}
                </p>
                <ul className="list-disc pl-6">
                  {result.uncertain.map((part) => (
                    <li key={partKey(part)}>{partName(part, language)}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
          {plan && (
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void restore()} disabled={importing || !restorable(plan)}>
                <LuUpload aria-hidden="true" />
                {importing ? t('読み込んでいます…', 'Restoring…') : t('読み込む', 'Restore')}
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setChosen(null);
                  setFileField((value) => value + 1);
                }}
              >
                {t('やめる', 'Cancel')}
              </Button>
            </div>
          )}
        </Card>
      </div>
    </AppLayout>
  );
}
