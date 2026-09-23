'use client';

import { useState } from 'react';
import { LuDownload, LuSave } from 'react-icons/lu';

import { Button } from '@/components/ui';
import { useStorageStatus } from '@/lib/browser-storage';
import { buildRecordsCsv, summarisePattern } from '@/lib/shot-pattern';
import { useLanguage } from '@/store';

import { selectScale, useShotPatternStore } from './_store';

export function SavedMeasurements() {
  const state = useShotPatternStore();
  const {
    records,
    shots,
    note,
    setNote,
    diameterCm,
    pellets,
    deletedRecord,
    saveRecord,
    loadRecord,
    deleteRecord,
    undoDelete,
  } = state;
  const language = useLanguage();
  const available = useStorageStatus((status) => status.available);
  const [name, setName] = useState('');
  // Both wordings, picked at render, so a message follows a language change.
  const [message, setMessage] = useState<[ja: string, en: string] | null>(null);
  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);
  const number = new Intl.NumberFormat(language, { maximumFractionDigits: 1 });
  const percent = new Intl.NumberFormat(language, { style: 'percent', maximumFractionDigits: 1 });
  const dateTime = new Intl.DateTimeFormat(language, { dateStyle: 'medium', timeStyle: 'short' });
  const ready = selectScale(state) !== null;
  // Every write can fail on a full device, so what reaches storage is reported, not assumed.
  const storedMessage = (done: [string, string]): [string, string] =>
    useStorageStatus.getState().available ? done : ['端末に保存できませんでした。', 'Could not save to this device.'];
  // saveRecord only reports failure, so the reason is derived here.
  const saveProblem = (): [string, string] =>
    selectScale(state) === null
      ? ['実寸の基準を設定してください。', 'Set the scale before saving.']
      : !(diameterCm > 0)
        ? ['円の直径に 0 より大きい数値を入力してください。', 'Enter a circle diameter greater than zero.']
        : pellets !== null && !(Number.isInteger(pellets) && pellets > 0)
          ? [
              '装弾の総粒数は 1 以上の整数で入力してください。',
              'Enter the pellet count as a whole number of 1 or more.',
            ]
          : ['同じ名前の記録があります。別の名前にしてください。', 'That name is already used. Choose another.'];
  // Loading overwrites the measurement on screen, with no undo.
  const confirmReplace = (name: string) =>
    (shots.length === 0 && note === '') ||
    window.confirm(
      t(
        `保存していない打点とメモは消えます。「${name}」を読み込みますか？`,
        `Unsaved shots and note will be lost. Load “${name}”?`,
      ),
    );

  const exportCsv = () => {
    // Excel needs the byte order mark to read UTF-8.
    const blob = new Blob([`﻿${buildRecordsCsv(records)}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'shot-pattern.csv';
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
              '写真は保存しません。保存するのは打点の座標（cm）・円の設定・メモ・日時です。',
              'The photo is not saved. Saved: shot positions (cm), circle setup, note and time.',
            )
          : t(
              '記録は保存できませんが、CSV には書き出せます。',
              'Measurements cannot be saved here, but CSV export works.',
            )}
      </p>
      <div className="space-y-2">
        <label htmlFor="note" className="block text-sm font-medium">
          {t('メモ（銃・チョーク・実包・距離など）', 'Note (gun, choke, load, distance)')}
        </label>
        <textarea
          id="note"
          rows={3}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder={t('例：上下二連 / フルチョーク / 7.5号 / 35 m', 'e.g. O/U, full choke, #7.5, 35 m')}
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
          {t('記録名', 'Measurement name')}
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            id="record-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t('例：35m フルチョーク', 'e.g. 35 m full choke')}
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
            const summary = summarisePattern(record.shots, {
              diameterCm: record.diameterCm,
              pellets: record.pellets,
            });
            return (
              <li key={record.id} className="space-y-1 py-3">
                <p className="font-medium">{record.name}</p>
                <p className="text-sm text-on-surface-variant">
                  {dateTime.format(new Date(record.savedAt))}
                  {' ・ '}
                  {t(
                    `円内 ${summary.inside} / 打点 ${summary.total}`,
                    `${summary.inside} in circle of ${summary.total}`,
                  )}
                  {summary.patternPercentage !== null &&
                    ` ・ ${t('パターン率', 'Pattern')} ${percent.format(summary.patternPercentage / 100)}`}
                  {` ・ ${t('円の直径', 'Circle')} ${number.format(record.diameterCm)} cm`}
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
                          : ['読み込めませんでした。', 'Could not load the measurement.'],
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
