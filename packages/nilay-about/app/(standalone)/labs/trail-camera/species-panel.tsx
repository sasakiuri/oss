'use client';

import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui';
import {
  deleteCachedModel,
  downloadModel,
  isModelCached,
  modelCacheAvailable,
  readCachedModel,
  type ModelFile,
} from '@/lib/model-download';
import { OUTLINE_RUNTIME_BYTES } from '@/lib/outline-model';
import { SpeciesClassifier } from '@/lib/species-classifier';
import {
  CAMERA_SPECIES,
  SPECIES_MODEL_BYTES,
  SPECIES_MODEL_FILES,
  cameraSpeciesOf,
  labelCommonName,
  type CameraSpeciesId,
} from '@/lib/species-model';
import type { CameraPhoto } from '@/lib/trail-camera';

/** A photo as this page holds it: its time, what it shows, and how to read it again for the model. */
export interface TaggedPhoto extends CameraPhoto {
  /** Made when the photo is read: names repeat across cards and inside ZIPs. */
  id: string;
  species: CameraSpeciesId | null;
  /** Who marked it: the reader, or the model (which never overrides the reader). */
  markedBy: 'reader' | 'model' | null;
  /** The model's best answer, kept to show even where it was not used. */
  guess: { label: string; score: number } | null;
  read: () => Promise<Blob>;
}

/** Below this the model's answer is shown but not used to mark the photo. */
export const SPECIES_SCORE_MIN = 0.5;

type Stage =
  | { kind: 'idle'; kept: boolean }
  | { kind: 'downloading'; fraction: number }
  | { kind: 'starting' }
  | { kind: 'running'; done: number; total: number; backend: 'webgpu' | 'wasm' }
  | { kind: 'done'; backend: 'webgpu' | 'wasm'; failed: number }
  | { kind: 'failed'; reason: 'network' | 'integrity' | 'model' };

const megabytes = (bytes: number) => (bytes / 1_000_000).toFixed(1);

/** The time on the photo, as the camera wrote it. */
const shotAt = ({ time }: CameraPhoto) =>
  `${time.year}-${String(time.month).padStart(2, '0')}-${String(time.day).padStart(2, '0')} ${String(time.hour).padStart(2, '0')}:${String(time.minute).padStart(2, '0')}`;

interface SpeciesPanelProps {
  language: 'ja' | 'en';
  photos: TaggedPhoto[];
  onChange: (update: (photos: TaggedPhoto[]) => TaggedPhoto[]) => void;
}

/**
 * What each photo shows: marked by the reader, or, when asked, by SpeciesNet running in this browser.
 * The model is fetched from Hugging Face only after the reader presses the button that states its size;
 * the photos never leave the device.
 */
export function SpeciesPanel({ language, photos, onChange }: SpeciesPanelProps) {
  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);
  const [stage, setStage] = useState<Stage>({ kind: 'idle', kept: false });
  // A run has a number; a newer run, a delete or leaving the page makes an older one stop where it is.
  const runRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const classifierRef = useRef<SpeciesClassifier | null>(null);
  // The worker being started, so a stop, a delete or leaving the page can end it before it is ready.
  const startingRef = useRef<SpeciesClassifier | null>(null);
  const labelsRef = useRef<string[] | null>(null);
  const backendRef = useRef<'webgpu' | 'wasm'>('wasm');
  const photosRef = useRef(photos);
  const [loaded, setLoaded] = useState(false);
  const [cacheAvailable, setCacheAvailable] = useState(true);

  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);

  useEffect(() => {
    let cancelled = false;
    void Promise.all(Object.values(SPECIES_MODEL_FILES).map(isModelCached)).then((found) => {
      if (cancelled) return;
      setCacheAvailable(modelCacheAvailable());
      setStage((current) => (current.kind === 'idle' ? { kind: 'idle', kept: found.every(Boolean) } : current));
    });
    return () => {
      cancelled = true;
      closeModel();
    };
  }, []);

  /** Ends the run under way and the worker with it, so no inference goes on after the page says it stopped. */
  function closeModel() {
    runRef.current += 1;
    abortRef.current?.abort();
    startingRef.current?.dispose();
    startingRef.current = null;
    classifierRef.current?.dispose();
    classifierRef.current = null;
  }

  const busy = stage.kind === 'downloading' || stage.kind === 'starting' || stage.kind === 'running';

  const fetchFile = async (file: ModelFile, signal: AbortSignal, onProgress: (fraction: number) => void) =>
    (await readCachedModel(file)) ?? (await downloadModel(file, onProgress, signal)).data;

  const run = async () => {
    if (busy) return;
    const current = ++runRef.current;
    const live = () => runRef.current === current;
    const abort = new AbortController();
    abortRef.current = abort;
    try {
      if (!classifierRef.current) {
        setStage({ kind: 'downloading', fraction: 0 });
        let labelsDone = 0;
        const labelsBytes = await fetchFile(SPECIES_MODEL_FILES.labels, abort.signal, () => undefined);
        // Counted whole once in hand, whether downloaded or read from the saved copy.
        labelsDone = SPECIES_MODEL_FILES.labels.bytes;
        if (!live()) return;
        let shownPercent = -1;
        const model = await fetchFile(SPECIES_MODEL_FILES.model, abort.signal, (fraction) => {
          const done = (labelsDone + fraction * SPECIES_MODEL_FILES.model.bytes) / SPECIES_MODEL_BYTES;
          // Every tenth of the way, so a screen reader is not read a figure for each chunk.
          const percent = Math.floor(done * 10) * 10;
          if (!live() || percent === shownPercent) return;
          shownPercent = percent;
          setStage({ kind: 'downloading', fraction: percent / 100 });
        });
        if (!live()) return;
        labelsRef.current = new TextDecoder()
          .decode(labelsBytes)
          .split('\n')
          .map((line) => line.trim());
        setStage({ kind: 'starting' });
        const classifier = new SpeciesClassifier();
        startingRef.current = classifier;
        try {
          const backend = await classifier.load(model);
          if (!live()) {
            classifier.dispose();
            return;
          }
          startingRef.current = null;
          classifierRef.current = classifier;
          backendRef.current = backend;
          setLoaded(true);
        } catch {
          classifier.dispose();
          if (live()) setStage({ kind: 'failed', reason: 'model' });
          return;
        }
      }
      const classifier = classifierRef.current;
      const labels = labelsRef.current!;
      const backend = backendRef.current;
      // Only photos the reader has not marked; the model never changes what the reader chose.
      const queue = photosRef.current.filter((photo) => photo.markedBy !== 'reader').map((photo) => photo.id);
      let failed = 0;
      for (const [index, id] of queue.entries()) {
        if (!live()) return;
        setStage({ kind: 'running', done: index, total: queue.length, backend });
        const photo = photosRef.current.find((candidate) => candidate.id === id);
        if (!photo || photo.markedBy === 'reader') continue;
        try {
          const blob = await photo.read();
          if (!live()) return;
          const [best] = await classifier.classify(blob);
          if (!live()) return;
          if (!best) continue;
          const label = labels[best.index] ?? '';
          onChange((all) =>
            all.map((item) =>
              item.id !== id || item.markedBy === 'reader'
                ? item
                : {
                    ...item,
                    guess: { label, score: best.score },
                    species: best.score >= SPECIES_SCORE_MIN ? cameraSpeciesOf(label) : null,
                    markedBy: best.score >= SPECIES_SCORE_MIN ? 'model' : null,
                  },
            ),
          );
        } catch {
          failed += 1;
        }
      }
      if (live()) setStage({ kind: 'done', backend, failed });
    } catch (error) {
      if (!live()) return;
      setStage({
        kind: 'failed',
        reason: error instanceof Error && error.name === 'ModelIntegrityError' ? 'integrity' : 'network',
      });
    }
  };

  const stop = () => {
    closeModel();
    setLoaded(false);
    setStage({ kind: 'idle', kept: false });
    void Promise.all(Object.values(SPECIES_MODEL_FILES).map(isModelCached)).then((found) =>
      setStage((current) => (current.kind === 'idle' ? { kind: 'idle', kept: found.every(Boolean) } : current)),
    );
  };

  const remove = async () => {
    closeModel();
    setLoaded(false);
    await Promise.allSettled(Object.values(SPECIES_MODEL_FILES).map(deleteCachedModel));
    setStage({ kind: 'idle', kept: false });
  };

  const name = (id: CameraSpeciesId) => {
    const entry = CAMERA_SPECIES.find((species) => species.id === id)!;
    return language === 'ja' ? entry.ja : entry.en;
  };
  const total = megabytes(SPECIES_MODEL_BYTES + OUTLINE_RUNTIME_BYTES);

  const status = (() => {
    switch (stage.kind) {
      case 'downloading':
        return t(
          `ダウンロード中… ${Math.round(stage.fraction * 100)}%`,
          `Downloading… ${Math.round(stage.fraction * 100)}%`,
        );
      case 'starting':
        return t('モデルを準備しています…', 'Starting the model…');
      case 'running':
        return t(`判別中… ${stage.done} / ${stage.total}`, `Identifying… ${stage.done} / ${stage.total}`);
      case 'done':
        return (
          t(
            `判別しました（${stage.backend === 'webgpu' ? 'GPU' : 'CPU'} で実行）。`,
            `Done (on the ${stage.backend === 'webgpu' ? 'GPU' : 'CPU'}).`,
          ) +
          (stage.failed > 0
            ? t(`${stage.failed} 枚は読めませんでした。`, ` ${stage.failed} photos could not be read.`)
            : '')
        );
      case 'failed':
        return stage.reason === 'integrity'
          ? t(
              'ダウンロードしたモデルが記録と一致しないため、使いませんでした。',
              'The downloaded model did not match its record and was not used.',
            )
          : stage.reason === 'model'
            ? t('このブラウザーではモデルを動かせませんでした。', 'The model could not run in this browser.')
            : t('モデルをダウンロードできませんでした。', 'The model could not be downloaded.');
      default:
        return '';
    }
  })();

  return (
    <div className="space-y-4">
      <p className="text-sm text-on-surface-variant">
        {t(
          `AI（Google の SpeciesNet）で種を判別できます。初回はモデル ${megabytes(SPECIES_MODEL_BYTES)} MB（Hugging Face）と実行環境 ${megabytes(OUTLINE_RUNTIME_BYTES)} MB（このサイト）をダウンロードします。`,
          `The AI (Google's SpeciesNet) can mark the species. The first run downloads the ${megabytes(SPECIES_MODEL_BYTES)} MB model from Hugging Face and the ${megabytes(OUTLINE_RUNTIME_BYTES)} MB runtime from this site.`,
        )}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => void run()} disabled={busy || photos.length === 0}>
          {stage.kind === 'idle' && stage.kept
            ? t('保存済みの AI で判別する', 'Identify with the saved AI')
            : loaded
              ? t('まだ選んでいない写真を AI で判別', 'Identify the unmarked photos with the AI')
              : t(`AI で判別する（${total} MB）`, `Identify with the AI (${total} MB)`)}
        </Button>
        {busy && (
          <Button variant="ghost" onClick={stop}>
            {t('中止', 'Stop')}
          </Button>
        )}
        {!busy && (stage.kind === 'idle' ? stage.kept : true) && (
          <Button variant="ghost" onClick={() => void remove()}>
            {t('保存した AI モデルを削除', 'Delete the saved AI model')}
          </Button>
        )}
      </div>
      <p role="status" className="text-sm">
        {status}
      </p>
      {!cacheAvailable && (
        <p className="text-xs text-on-surface-variant">
          {t(
            'このブラウザーはモデルを保存できないため、使うたびにダウンロードします。',
            'This browser cannot keep the model; it is downloaded on every run.',
          )}
        </p>
      )}
      <p className="text-xs text-on-surface-variant">
        {t('AI のモデル: ', 'AI model: ')}
        <a
          href="https://huggingface.co/sasakiuri/speciesnet-v4.0.3b-onnx"
          className="text-primary underline"
          target="_blank"
          rel="noreferrer"
        >
          SpeciesNet v4.0.3b（ONNX）
        </a>
        {t(
          '。Copyright 2024 Google LLC、Apache License 2.0。Google の公開モデルを ONNX 形式に変換したものです。',
          '. Copyright 2024 Google LLC, Apache License 2.0; Google’s published model converted to ONNX.',
        )}
      </p>
      <p className="text-xs text-on-surface-variant">
        {t(
          `確からしさ ${SPECIES_SCORE_MIN * 100}% 未満の答えは表示だけにして、種は付けません。SpeciesNet にはニホンザルの分類がなく「サル」、カモシカ・アナグマ・ノウサギ・テンは属までの判別です。人の手で選んだ種は AI が上書きしません。`,
          `Answers below ${SPECIES_SCORE_MIN * 100}% are shown but not used. SpeciesNet has no Japanese macaque (it says macaque) and names serow, badger, hare and marten only to the genus. The AI never changes a species chosen by hand.`,
        )}
      </p>
      {photos.length > 0 && (
        <div className="max-h-96 overflow-y-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">{t('写真ごとの種', 'Species per photo')}</caption>
            <thead>
              <tr>
                <th scope="col" className="text-left font-medium">
                  {t('写真', 'Photo')}
                </th>
                <th scope="col" className="text-left font-medium">
                  {t('写っているもの', 'Shows')}
                </th>
              </tr>
            </thead>
            <tbody>
              {photos.map((photo) => (
                <tr key={photo.id} className="border-t border-outline-variant">
                  <td className="py-1 pr-2 align-top break-all">
                    <span className="block">{photo.name}</span>
                    <span className="block text-xs text-on-surface-variant">{shotAt(photo)}</span>
                  </td>
                  <td className="py-1 align-top">
                    <select
                      aria-label={t(`${photo.name} に写っているもの`, `What ${photo.name} shows`)}
                      className="rounded-sm border border-outline bg-surface px-2 py-1"
                      value={photo.species ?? ''}
                      onChange={(event) => {
                        const value = event.target.value as CameraSpeciesId | '';
                        onChange((all) =>
                          all.map((item) =>
                            item.id === photo.id
                              ? {
                                  ...item,
                                  species: value === '' ? null : value,
                                  markedBy: value === '' ? null : 'reader',
                                }
                              : item,
                          ),
                        );
                      }}
                    >
                      <option value="">{t('未選択', 'Not marked')}</option>
                      {CAMERA_SPECIES.map((species) => (
                        <option key={species.id} value={species.id}>
                          {name(species.id)}
                        </option>
                      ))}
                    </select>
                    {photo.guess && (
                      <span className="block text-xs text-on-surface-variant">
                        {t(
                          `AI: ${labelCommonName(photo.guess.label)}（${Math.round(photo.guess.score * 100)}%）${photo.markedBy === 'model' ? '' : '・未使用'}`,
                          `AI: ${labelCommonName(photo.guess.label)} (${Math.round(photo.guess.score * 100)}%)${photo.markedBy === 'model' ? '' : ', not used'}`,
                        )}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
