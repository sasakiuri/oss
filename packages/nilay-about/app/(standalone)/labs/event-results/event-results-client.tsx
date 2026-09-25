'use client';

import { useId, useState } from 'react';
import { LuCopy, LuPencil, LuTrash2, LuUpload } from 'react-icons/lu';
import { z } from 'zod';

import { ConditionSection, ToolLayout } from '@/components/labs';
import { Button, Card } from '@/components/ui';
import { errorKind, ERROR_MESSAGES, sendJson } from '@/features/labs-notify/client';
import { NoticeLine, ToolFrame, type Notice } from '@/features/labs-notify/components/tool-frame';
import {
  parseResultsTable,
  readResultsId,
  RESULTS_CELL_MAX_LENGTH,
  RESULTS_COLUMNS_MAX,
  RESULTS_DAYS_OPTIONS,
  RESULTS_NOTE_MAX_LENGTH,
  RESULTS_PASSPHRASE_MAX_LENGTH,
  RESULTS_PASSPHRASE_MIN_LENGTH,
  RESULTS_ROWS_MAX,
  RESULTS_TITLE_MAX_LENGTH,
  resultsViewPath,
  tableToText,
  type TableError,
} from '@/lib/event-results';
import { requestJson } from '@/lib/http/client';
import { labsTool } from '@/lib/labs-tools';
import { createdResultsSchema, resultsViewSchema } from '@/lib/schemas/event-results';

import { EVENT_RESULTS_STORAGE_KEY, SAVED_PAGES_MAX, useEventResultsStore } from './_store';

const rehydrate = () => useEventResultsStore.persist.rehydrate();

const TABLE_ERRORS: Record<TableError, { ja: string; en: string }> = {
  empty: {
    ja: '見出しの行と、1 行以上の成績を貼り付けてください。',
    en: 'Paste a header row and at least one result.',
  },
  tooManyColumns: {
    ja: `列は ${RESULTS_COLUMNS_MAX} 列までです。`,
    en: `Up to ${RESULTS_COLUMNS_MAX} columns.`,
  },
  tooManyRows: { ja: `成績は ${RESULTS_ROWS_MAX} 行までです。`, en: `Up to ${RESULTS_ROWS_MAX} rows.` },
  cellTooLong: {
    ja: `1 つのセルは ${RESULTS_CELL_MAX_LENGTH} 文字までです。`,
    en: `Each cell holds up to ${RESULTS_CELL_MAX_LENGTH} characters.`,
  },
};

export function EventResultsClient() {
  const { value, set } = useEventResultsStore();
  const [editing, setEditing] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [table, setTable] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [days, setDays] = useState<number>(30);
  const [link, setLink] = useState('');
  const [notice, setNotice] = useState<Notice | null>(null);
  const formId = useId();

  const parsed = parseResultsTable(table);
  const fail = (error: unknown) => setNotice({ error: true, ...ERROR_MESSAGES[errorKind(error)] });
  const origin = typeof window === 'undefined' ? '' : window.location.origin;

  const remember = (page: { id: string; title: string; expiresAt: string }) =>
    set({ pages: [...value.pages.filter((item) => item.id !== page.id), page].slice(-SAVED_PAGES_MAX) });

  const publish = async () => {
    if (!parsed.ok) {
      setNotice({ error: true, ...TABLE_ERRORS[parsed.error] });
      return;
    }
    if (!title.trim() || [...passphrase].length < RESULTS_PASSPHRASE_MIN_LENGTH) {
      setNotice({
        error: true,
        ja: `大会名と ${RESULTS_PASSPHRASE_MIN_LENGTH} 文字以上の合言葉を入力してください。`,
        en: `Enter the match name and a passphrase of at least ${RESULTS_PASSPHRASE_MIN_LENGTH} characters.`,
      });
      return;
    }
    const content = { title: title.trim(), note: note.trim(), columns: parsed.columns, rows: parsed.rows };
    try {
      if (editing) {
        const view = await sendJson(`/api/labs/results/${editing}`, 'PUT', { passphrase, content }, resultsViewSchema);
        remember({ id: editing, title: view.title, expiresAt: view.expiresAt });
        setNotice({ error: false, ja: 'リザルトを更新しました。', en: 'Results updated.' });
      } else {
        const created = await sendJson(
          '/api/labs/results',
          'POST',
          { passphrase, days, content },
          createdResultsSchema,
        );
        remember({ id: created.id, title: content.title, expiresAt: created.expiresAt });
        setEditing(created.id);
        setNotice({ error: false, ja: 'リザルトを公開しました。', en: 'Results published.' });
      }
    } catch (error) {
      fail(error);
    }
  };

  const load = async (id: string) => {
    try {
      const view = await requestJson(`/api/labs/results/${id}`, resultsViewSchema, { cache: 'no-store' });
      setEditing(id);
      setTitle(view.title);
      setNote(view.note);
      setTable(tableToText(view.columns, view.rows));
      setNotice({
        error: false,
        ja: '読み込みました。修正には作成時の合言葉が必要です。',
        en: 'Loaded. Editing needs the passphrase it was made with.',
      });
    } catch (error) {
      if (errorKind(error) === 'notFound') set({ pages: value.pages.filter((page) => page.id !== id) });
      fail(error);
    }
  };

  const remove = async () => {
    if (!editing) return;
    try {
      await sendJson(`/api/labs/results/${editing}`, 'DELETE', { passphrase }, z.object({ removed: z.boolean() }));
      set({ pages: value.pages.filter((page) => page.id !== editing) });
      setEditing(null);
      setTitle('');
      setNote('');
      setTable('');
      setNotice({ error: false, ja: 'リザルトを削除しました。', en: 'Results deleted.' });
    } catch (error) {
      fail(error);
    }
  };

  return (
    <ToolFrame title={labsTool('event-results').title} storageKey={EVENT_RESULTS_STORAGE_KEY} rehydrate={rehydrate}>
      {(language) => {
        const t = (ja: string, en: string) => (language === 'ja' ? ja : en);
        return (
          <ToolLayout
            proportions="workspace"
            resultLabel={t('公開したリザルト', 'Published results')}
            primary={
              <Card variant="outlined" className="space-y-4 rounded-md p-5 sm:p-6">
                <h2 className="text-xl font-medium">
                  {editing ? t('リザルトを修正', 'Edit results') : t('リザルトを作る', 'Make a results page')}
                </h2>
                <div className="space-y-1">
                  <label htmlFor={`${formId}-title`} className="block text-sm font-medium">
                    {t('大会名', 'Match name')}
                  </label>
                  <input
                    id={`${formId}-title`}
                    value={title}
                    maxLength={RESULTS_TITLE_MAX_LENGTH}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor={`${formId}-table`} className="block text-sm font-medium">
                    {t('成績表（1 行目は見出し）', 'Results table (first row is the header)')}
                  </label>
                  <textarea
                    id={`${formId}-table`}
                    rows={10}
                    value={table}
                    onChange={(e) => setTable(e.target.value)}
                    placeholder={t('順位\t氏名\t所属\t点数\n1\t…', 'Rank\tName\tClub\tScore\n1\t…')}
                    className="font-mono"
                  />
                  <p className="text-xs text-on-surface-variant">
                    {t('表計算ソフトの範囲か CSV を貼り付けます。', 'Paste a spreadsheet range or CSV.')}
                    {table &&
                      (parsed.ok
                        ? t(` ${parsed.rows.length} 行を読み取りました。`, ` ${parsed.rows.length} rows read.`)
                        : ` ${TABLE_ERRORS[parsed.error][language]}`)}
                  </p>
                </div>
                <div className="space-y-1">
                  <label htmlFor={`${formId}-note`} className="block text-sm font-medium">
                    {t('補足（任意）', 'Note (optional)')}
                  </label>
                  <textarea
                    id={`${formId}-note`}
                    rows={2}
                    maxLength={RESULTS_NOTE_MAX_LENGTH}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label htmlFor={`${formId}-pass`} className="block text-sm font-medium">
                      {t('主催者の合言葉', 'Organiser’s passphrase')}
                    </label>
                    <input
                      id={`${formId}-pass`}
                      type="password"
                      autoComplete="off"
                      value={passphrase}
                      maxLength={RESULTS_PASSPHRASE_MAX_LENGTH}
                      onChange={(e) => setPassphrase(e.target.value)}
                    />
                    <p className="text-xs text-on-surface-variant">
                      {t(
                        `${RESULTS_PASSPHRASE_MIN_LENGTH} 文字以上。修正・削除に必要で、この端末には保存しません。`,
                        `At least ${RESULTS_PASSPHRASE_MIN_LENGTH} characters. Needed to edit or delete, and not saved on this device.`,
                      )}
                    </p>
                  </div>
                  {!editing && (
                    <div className="space-y-1">
                      <label htmlFor={`${formId}-days`} className="block text-sm font-medium">
                        {t('公開期間', 'Keep for')}
                      </label>
                      <select id={`${formId}-days`} value={days} onChange={(e) => setDays(Number(e.target.value))}>
                        {RESULTS_DAYS_OPTIONS.map((option) => (
                          <option key={option} value={option}>
                            {t(`${option} 日`, `${option} days`)}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => void publish()}>
                    <LuUpload aria-hidden="true" />
                    {editing ? t('更新する', 'Update') : t('公開する', 'Publish')}
                  </Button>
                  {editing && (
                    <>
                      <Button
                        variant="outline"
                        onClick={() =>
                          window.confirm(t('このリザルトを削除しますか？', 'Delete these results?')) && void remove()
                        }
                      >
                        <LuTrash2 aria-hidden="true" />
                        {t('削除する', 'Delete')}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setEditing(null);
                          setTitle('');
                          setNote('');
                          setTable('');
                        }}
                      >
                        {t('新しく作る', 'Start a new one')}
                      </Button>
                    </>
                  )}
                </div>
                <NoticeLine notice={notice} language={language} />
              </Card>
            }
            result={
              <div className="space-y-4">
                <Card variant="outlined" className="space-y-3 rounded-md p-5 sm:p-6">
                  <h2 className="text-xl font-medium">{t('この端末で作ったリザルト', 'Made on this device')}</h2>
                  {value.pages.length === 0 ? (
                    <p className="text-sm text-on-surface-variant">{t('ありません。', 'None yet.')}</p>
                  ) : (
                    <ul className="space-y-3">
                      {value.pages.map((page) => {
                        const url = `${origin}${resultsViewPath(page.id)}`;
                        return (
                          <li key={page.id} className="space-y-2 rounded-sm bg-surface-container p-3 text-sm">
                            <p className="font-medium">{page.title}</p>
                            <p className="text-xs text-on-surface-variant">
                              {t(
                                `${new Date(page.expiresAt).toLocaleDateString('ja-JP')} に自動削除`,
                                `Deleted automatically on ${new Date(page.expiresAt).toLocaleDateString('en-GB')}`,
                              )}
                            </p>
                            <a href={resultsViewPath(page.id)} target="_blank" rel="noreferrer" className="break-all">
                              {url}
                            </a>
                            <div className="flex flex-wrap gap-2">
                              <Button
                                variant="outline"
                                onClick={() =>
                                  void navigator.clipboard
                                    ?.writeText(url)
                                    .then(() =>
                                      setNotice({ error: false, ja: 'リンクをコピーしました。', en: 'Link copied.' }),
                                    )
                                }
                              >
                                <LuCopy aria-hidden="true" />
                                {t('リンクをコピー', 'Copy link')}
                              </Button>
                              <Button variant="outline" onClick={() => void load(page.id)}>
                                <LuPencil aria-hidden="true" />
                                {t('修正する', 'Edit')}
                              </Button>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </Card>
                <Card variant="outlined" className="space-y-3 rounded-md p-5 sm:p-6">
                  <label htmlFor={`${formId}-link`} className="block text-sm font-medium">
                    {t('ほかの端末で作ったリザルトを修正', 'Edit results made on another device')}
                  </label>
                  <input
                    id={`${formId}-link`}
                    value={link}
                    placeholder={t('公開ページのリンク', 'Link to the results page')}
                    onChange={(e) => setLink(e.target.value)}
                  />
                  <Button
                    variant="outline"
                    onClick={() => {
                      const id = readResultsId(link);
                      if (id) void load(id);
                      else
                        setNotice({
                          error: true,
                          ja: 'リザルトのリンクを貼り付けてください。',
                          en: 'Paste a results link.',
                        });
                    }}
                  >
                    {t('読み込む', 'Load')}
                  </Button>
                </Card>
              </div>
            }
            extras={
              <ConditionSection
                id="privacy"
                title={t('公開範囲と個人情報', 'Visibility and personal data')}
                summary={t(
                  'リンクを知っていれば誰でも見られます。検索エンジンには載りません。',
                  'Anyone with the link can see it. Search engines do not list it.',
                )}
              >
                <ul className="list-disc space-y-2 pl-5 text-sm text-on-surface-variant">
                  <li>
                    {t(
                      '選手の氏名・所属を載せる場合は、参加者の同意を得てください。',
                      'If you list names or clubs, get the participants’ agreement first.',
                    )}
                  </li>
                  <li>
                    {t(
                      '合言葉はハッシュ化して保存し、修正・削除の試行は 1 分に 5 回までです。忘れると修正も削除もできず、期限まで公開されたままになります。',
                      'The passphrase is stored hashed, and edit attempts are limited to five a minute. Without it the page can be neither edited nor deleted until it expires.',
                    )}
                  </li>
                  <li>
                    {t(
                      `表は ${RESULTS_COLUMNS_MAX} 列・${RESULTS_ROWS_MAX} 行・1 セル ${RESULTS_CELL_MAX_LENGTH} 文字まで。修正しても公開期限は延びません。`,
                      `Up to ${RESULTS_COLUMNS_MAX} columns, ${RESULTS_ROWS_MAX} rows and ${RESULTS_CELL_MAX_LENGTH} characters a cell. Editing does not extend the period.`,
                    )}
                  </li>
                </ul>
              </ConditionSection>
            }
          />
        );
      }}
    </ToolFrame>
  );
}
