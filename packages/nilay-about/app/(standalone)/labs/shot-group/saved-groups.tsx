'use client';

import { useState } from 'react';
import { LuDownload, LuSave } from 'react-icons/lu';

import { Button } from '@/components/ui';
import { useStorageStatus } from '@/lib/browser-storage';
import { buildRecordsCsv, summariseGroup, toAngularSize } from '@/lib/shot-group';
import { toMeters } from '@/lib/sight-adjustment';
import { useLanguage } from '@/store';

import { selectScale, useShotGroupStore } from './_store';

export function SavedGroups() {
  const state = useShotGroupStore();
  const { records, impacts, note, setNote, distance, deletedRecord, saveRecord, loadRecord, deleteRecord, undoDelete } =
    state;
  const language = useLanguage();
  const available = useStorageStatus((status) => status.available);
  const [name, setName] = useState('');
  // Both wordings, picked at render, so a message follows a language change.
  const [message, setMessage] = useState<[ja: string, en: string] | null>(null);
  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);
  const number = new Intl.NumberFormat(language, { maximumFractionDigits: 1 });
  const dateTime = new Intl.DateTimeFormat(language, { dateStyle: 'medium', timeStyle: 'short' });
  const ready = selectScale(state) !== null;
  // Every write can fail on a full device, so what reaches storage is reported, not assumed.
  const storedMessage = (done: [string, string]): [string, string] =>
    useStorageStatus.getState().available ? done : ['端末に保存できませんでした。', 'Could not save to this device.'];
  // saveRecord only reports failure, so the reason is derived here.
  const saveProblem = (): [string, string] =>
    selectScale(state) === null
      ? ['実寸の基準を設定してください。', 'Set the scale before saving.']
      : !(distance.value > 0)
        ? ['射距離に 0 より大きい数値を入力してください。', 'Enter a shooting distance greater than zero.']
        : ['同じ名前の記録があります。別の名前にしてください。', 'That name is already used. Choose another.'];
  // Loading overwrites the measurement on screen, with no undo.
  const confirmReplace = (name: string) =>
    (impacts.length === 0 && note === '') ||
    window.confirm(
      t(
        `保存していない着弾とメモは消えます。「${name}」を読み込みますか？`,
        `Unsaved impacts and note will be lost. Load “${name}”?`,
      ),
    );

  const exportCsv = () => {
    // Excel needs the byte order mark to read UTF-8.
    const blob = new Blob([`﻿${buildRecordsCsv(records)}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'shot-group.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMessage(['CSV を書き出しました。', 'Exported the CSV file.']);
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-on-surface-variant" role="status">
        {available
          ? t(
              '写真は保存しません。保存するのは着弾位置（狙点から mm）・射距離・弾径・メモ・日時です。',
              'The photo is not saved. Saved: impact positions (mm from the aim point), distance, bullet diameter, note and time.',
            )
          : t('記録は保存できませんが、CSV には書き出せます。', 'Groups cannot be saved here, but CSV export works.')}
      </p>
      <div className="space-y-2">
        <label htmlFor="note" className="block text-sm font-medium">
          {t('メモ（銃・弾・条件など）', 'Note (rifle, load, conditions)')}
        </label>
        <textarea
          id="note"
          rows={3}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder={t('例：308Win / 150gr / 依託射撃 / 無風', 'e.g. .308 Win, 150 gr, bench, no wind')}
          className="w-full rounded-sm border border-outline bg-surface p-3 text-base text-on-surface"
        />
      </div>
      <form
        className="space-y-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (!saveRecord(name)) {
            setMessage(saveProblem());
            return;
          }
          setName('');
          setMessage(storedMessage(['保存しました。', 'Saved.']));
        }}
      >
        <label htmlFor="record-name" className="block text-sm font-medium">
          {t('記録名', 'Group name')}
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            id="record-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t('例：100m 初弾調整', 'e.g. 100 m load A')}
            className="min-w-0 flex-1"
          />
          <Button type="submit" variant="secondary" disabled={!ready || !name.trim() || !available}>
            <LuSave aria-hidden="true" />
            {t('保存', 'Save')}
          </Button>
        </div>
      </form>
      {records.length > 0 && (
        <ul className="divide-y divide-outline-variant border-y border-outline-variant">
          {records.map((record) => {
            const summary = summariseGroup(record.impacts, { bulletDiameterMm: record.bulletDiameterMm });
            const spread = toAngularSize(
              summary.extremeSpreadMm,
              toMeters(record.distance.value, record.distance.unit),
            );
            return (
              <li key={record.id} className="space-y-1 py-3">
                <p className="font-medium">{record.name}</p>
                <p className="text-sm text-on-surface-variant">
                  {dateTime.format(new Date(record.savedAt))}
                  {' ・ '}
                  {t(`${summary.count} 発`, `${summary.count} ${summary.count === 1 ? 'shot' : 'shots'}`)}
                  {' ・ '}
                  {`${number.format(record.distance.value)} ${record.distance.unit}`}
                  {' ・ '}
                  {summary.extremeSpreadMm === null
                    ? t('群の大きさなし', 'No group size')
                    : `${number.format(summary.extremeSpreadMm)} mm${
                        spread ? t(`（${number.format(spread.moa)} MOA）`, ` (${number.format(spread.moa)} MOA)`) : ''
                      }`}
                </p>
                {record.note && <p className="whitespace-pre-wrap text-sm">{record.note}</p>}
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    disabled={!ready}
                    onClick={() => {
                      if (!confirmReplace(record.name)) return;
                      setMessage(
                        loadRecord(record.id)
                          ? [`「${record.name}」を読み込みました。`, `Loaded “${record.name}”.`]
                          : ['読み込めませんでした。', 'Could not load the group.'],
                      );
                    }}
                  >
                    {t('呼び出す', 'Load')}
                  </Button>
                  <Button
                    variant="ghost"
                    aria-label={t(`「${record.name}」を削除`, `Delete ${record.name}`)}
                    onClick={() => {
                      deleteRecord(record.id);
                      setMessage(null);
                    }}
                  >
                    {t('削除', 'Delete')}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <div className="space-y-2 border-t border-outline-variant pt-4">
        <Button variant="outline" disabled={records.length === 0} onClick={exportCsv}>
          <LuDownload aria-hidden="true" />
          {t('CSV を書き出す', 'Export CSV')}
        </Button>
      </div>
      {/*
        One region, mounted empty so changes are announced. The undo offer and a message can both be
        shown; a deletion clears the message. Not atomic, so the undo offer is not re-read each time.
      */}
      <div role="status" aria-atomic="false" className={deletedRecord || message ? 'space-y-2 text-sm' : 'sr-only'}>
        {deletedRecord && (
          <div className="flex flex-wrap items-center gap-2">
            <span>
              {t(`「${deletedRecord.record.name}」を削除しました。`, `Deleted “${deletedRecord.record.name}”.`)}
            </span>
            <Button
              variant="ghost"
              onClick={() => {
                undoDelete();
                setMessage(storedMessage(['元に戻しました。', 'Restored.']));
              }}
            >
              {t('元に戻す', 'Undo')}
            </Button>
          </div>
        )}
        {/* An element, so space-y applies. */}
        {message && <p>{t(...message)}</p>}
      </div>
    </div>
  );
}
