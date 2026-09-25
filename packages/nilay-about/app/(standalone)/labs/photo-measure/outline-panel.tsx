'use client';

import { useEffect, useRef, useState } from 'react';

import { SegmentedControl } from '@/components/labs';
import { Button } from '@/components/ui';
import {
  deleteCachedModel,
  downloadModel,
  isModelCached,
  modelCacheAvailable,
  readCachedModel,
  type ModelFile,
} from '@/lib/model-download';
import {
  OUTLINE_MODEL_BYTES,
  OUTLINE_MODEL_FILES,
  OUTLINE_RUNTIME_BYTES,
  OutlineModel,
  type Outline,
} from '@/lib/outline-model';

import type { OutlinePrompt } from './_store';

type Language = 'ja' | 'en';

type ModelState =
  | { kind: 'idle'; cached: boolean }
  | { kind: 'downloading'; fraction: number }
  | { kind: 'starting' }
  | { kind: 'ready'; backend: 'webgpu' | 'wasm'; kept: boolean }
  | { kind: 'failed'; reason: 'integrity' | 'network' | 'model' };

interface OutlinePanelProps {
  language: Language;
  photo: HTMLImageElement | null;
  prompts: OutlinePrompt[];
  /** Whether the next tap on the photo marks the animal or something to leave out. */
  foreground: boolean;
  onForegroundChange: (foreground: boolean) => void;
  active: boolean;
  onActivate: () => void;
  /** The model has been deleted, so the outline taps no longer do anything. */
  onDeactivate: () => void;
  onOutline: (outline: Outline | null) => void;
}

const megabytes = (bytes: number, language: Language) =>
  new Intl.NumberFormat(language, { maximumFractionDigits: 1 }).format(bytes / 1_000_000);

/**
 * The on-device outline: asking before the model is fetched, fetching and keeping it, and running it
 * on the photo whenever the taps change. Nothing here sends the photo anywhere; the only requests are
 * for the model files, from Hugging Face, and the runtime, from this site.
 */
export function OutlinePanel({
  language,
  photo,
  prompts,
  foreground,
  onForegroundChange,
  active,
  onActivate,
  onDeactivate,
  onOutline,
}: OutlinePanelProps) {
  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);
  const modelRef = useRef<OutlineModel | null>(null);
  // Starting and deleting take turns: each run has a number, a newer run or a delete makes an older
  // one stop where it is, and a download under way is aborted, so a deleted model never comes back.
  const runRef = useRef(0);
  const downloadRef = useRef<AbortController | null>(null);
  // The start under way, awaited by a delete: a cache write already begun is not stopped by the abort,
  // so the files are deleted only once it has settled.
  const startingRef = useRef<Promise<void> | null>(null);
  const [removing, setRemoving] = useState(false);
  // Read synchronously, so a double click cannot start two deletes before the next render.
  const removingRef = useRef(false);
  const [state, setState] = useState<ModelState>({ kind: 'idle', cached: false });
  const [encodedPhoto, setEncodedPhoto] = useState<HTMLImageElement | null>(null);
  const [busy, setBusy] = useState<'photo' | 'outline' | null>(null);
  const [runFailed, setRunFailed] = useState(false);
  // Read after the first render: the server has no Cache Storage, and the first render must match it.
  const [cacheAvailable, setCacheAvailable] = useState(true);
  // Any file kept, even one of the two after a download cut short, can be deleted from here.
  const [anyKept, setAnyKept] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void Promise.all(Object.values(OUTLINE_MODEL_FILES).map(isModelCached)).then((found) => {
      if (cancelled) return;
      setCacheAvailable(modelCacheAvailable());
      setAnyKept(found.some(Boolean));
      setState((current) => (current.kind === 'idle' ? { kind: 'idle', cached: found.every(Boolean) } : current));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(
    () => () => {
      // Leaving the page stops a start under way, so it keeps nothing after a delete made elsewhere.
      runRef.current += 1;
      downloadRef.current?.abort();
      modelRef.current?.dispose();
      modelRef.current = null;
    },
    [],
  );

  const ready = state.kind === 'ready';

  // A new photo is read by the encoder once; the taps that follow only run the decoder.
  useEffect(() => {
    const model = modelRef.current;
    if (!ready || !model || !photo || encodedPhoto === photo) return;
    let cancelled = false;
    setBusy('photo');
    setRunFailed(false);
    model
      .setPhoto(photo)
      .then((read) => {
        if (cancelled) return;
        if (read) setEncodedPhoto(photo);
        else setRunFailed(true);
      })
      .catch(() => {
        if (!cancelled) setRunFailed(true);
      })
      .finally(() => {
        if (!cancelled) setBusy(null);
      });
    return () => {
      cancelled = true;
    };
  }, [ready, photo, encodedPhoto]);

  useEffect(() => {
    const model = modelRef.current;
    if (!model || !photo || encodedPhoto !== photo || !prompts.some((prompt) => prompt.foreground)) {
      onOutline(null);
      return;
    }
    let cancelled = false;
    setBusy('outline');
    model
      .outline(prompts)
      .then((outline) => {
        if (!cancelled) onOutline(outline);
      })
      .catch(() => {
        if (!cancelled) setRunFailed(true);
      })
      .finally(() => {
        if (!cancelled) setBusy(null);
      });
    return () => {
      cancelled = true;
    };
  }, [photo, encodedPhoto, prompts, onOutline]);

  /** Whether any model file is kept now, read again because a run can stop between the two files. */
  const recheckKept = async () => {
    const found = await Promise.all(Object.values(OUTLINE_MODEL_FILES).map(isModelCached));
    setAnyKept(found.some(Boolean));
  };

  const start = () => {
    if (state.kind === 'downloading' || state.kind === 'starting' || removing) return;
    // Failures are shown by runStart itself; one it did not expect must not escape as an unhandled rejection.
    const starting = runStart()
      .catch(() => setState({ kind: 'failed', reason: 'model' }))
      .finally(() => {
        if (startingRef.current === starting) startingRef.current = null;
      });
    startingRef.current = starting;
  };

  const runStart = async () => {
    const run = ++runRef.current;
    const current = () => runRef.current === run;
    const download = new AbortController();
    downloadRef.current = download;
    setState({ kind: 'starting' });
    const files: ModelFile[] = [OUTLINE_MODEL_FILES.encoder, OUTLINE_MODEL_FILES.decoder];
    let kept = true;
    const buffers: ArrayBuffer[] = [];
    try {
      const received = files.map(() => 0);
      for (const [index, file] of files.entries()) {
        const cached = await readCachedModel(file);
        if (!current()) return;
        if (cached) {
          buffers.push(cached);
          received[index] = file.bytes;
          continue;
        }
        setState({ kind: 'downloading', fraction: 0 });
        const downloaded = await downloadModel(
          file,
          (fraction) => {
            received[index] = fraction * file.bytes;
            if (current())
              setState({ kind: 'downloading', fraction: received.reduce((a, b) => a + b, 0) / OUTLINE_MODEL_BYTES });
          },
          download.signal,
        );
        if (!current()) return;
        kept &&= downloaded.kept;
        buffers.push(downloaded.data);
      }
    } catch (error) {
      if (!current()) return;
      await recheckKept();
      if (!current()) return;
      setState({
        kind: 'failed',
        reason: error instanceof Error && error.name === 'ModelIntegrityError' ? 'integrity' : 'network',
      });
      return;
    }
    setState({ kind: 'starting' });
    const model = new OutlineModel();
    try {
      const backend = await model.load(buffers[0]!, buffers[1]!);
      if (!current()) {
        model.dispose();
        return;
      }
      modelRef.current = model;
      setState({ kind: 'ready', backend, kept });
      onActivate();
    } catch {
      model.dispose();
      if (!current()) return;
      await recheckKept();
      if (!current()) return;
      setState({ kind: 'failed', reason: 'model' });
    }
  };

  const remove = async () => {
    if (removingRef.current) return;
    removingRef.current = true;
    runRef.current += 1;
    downloadRef.current?.abort();
    downloadRef.current = null;
    setRemoving(true);
    modelRef.current?.dispose();
    modelRef.current = null;
    setEncodedPhoto(null);
    setBusy(null);
    setRunFailed(false);
    onOutline(null);
    onDeactivate();
    try {
      await startingRef.current?.catch(() => undefined);
      await Promise.allSettled(Object.values(OUTLINE_MODEL_FILES).map(deleteCachedModel));
    } finally {
      // Read again rather than assumed: a delete the browser refused leaves the files where they were.
      await recheckKept().catch(() => undefined);
      removingRef.current = false;
      setRemoving(false);
      setState({ kind: 'idle', cached: false });
    }
  };

  const size = megabytes(OUTLINE_MODEL_BYTES, language);
  const runtime = megabytes(OUTLINE_RUNTIME_BYTES, language);
  const total = megabytes(OUTLINE_MODEL_BYTES + OUTLINE_RUNTIME_BYTES, language);
  const status = (() => {
    if (state.kind === 'downloading')
      return t(
        `モデルをダウンロードしています（${Math.round(state.fraction * 100)}%）…`,
        `Downloading the model (${Math.round(state.fraction * 100)}%)…`,
      );
    if (state.kind === 'starting') return t('モデルを準備しています…', 'Starting the model…');
    if (state.kind === 'failed')
      return state.reason === 'integrity'
        ? t(
            'ダウンロードしたファイルが記録と一致しないため、使いませんでした。時間をおいてやり直してください。',
            'The downloaded file did not match its record, so it was not used. Try again later.',
          )
        : state.reason === 'network'
          ? t(
              'モデルをダウンロードできませんでした。通信を確認してやり直してください。',
              'The model could not be downloaded. Check the connection and try again.',
            )
          : t(
              'このブラウザーではモデルを動かせませんでした。点は手で置いて測れます。',
              'The model could not run in this browser. You can still place the points by hand.',
            );
    if (runFailed)
      return t(
        'この写真では輪郭を取れませんでした。点は手で置いて測れます。',
        'No outline could be made on this photo. Place the points by hand.',
      );
    if (busy === 'photo')
      return t(
        '写真をモデルに読み込んでいます。端末によっては数十秒かかります…',
        'The model is reading the photo. This can take tens of seconds on some devices…',
      );
    if (busy === 'outline') return t('輪郭を取っています…', 'Outlining…');
    if (state.kind === 'ready')
      return [
        state.backend === 'webgpu'
          ? ''
          : t('モデルは CPU で動いているため時間がかかります。', 'The model runs on the processor, so it is slow.'),
        state.kept
          ? ''
          : t(
              'このブラウザーには保存できなかったため、次回もダウンロードします。',
              'This browser would not keep it, so it will be downloaded again next time.',
            ),
      ]
        .filter(Boolean)
        .join(' ');
    return '';
  })();

  return (
    <div className="space-y-4">
      {!ready ? (
        <>
          <p className="text-sm text-on-surface-variant">
            {t(
              `初回はモデル ${size} MB（Hugging Face）と実行環境 ${runtime} MB（このサイト）をダウンロードし、このブラウザーに保存します。輪郭は端末内で取り、写真は送りません。`,
              `The first time, the ${size} MB model (from Hugging Face) and the ${runtime} MB runtime (from this site) are downloaded and kept in this browser. The outline is made on this device; the photo is not uploaded.`,
            )}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={start} disabled={state.kind === 'downloading' || state.kind === 'starting' || removing}>
              {state.kind === 'idle' && state.cached
                ? t('保存済みのモデルを使う', 'Use the saved model')
                : t(`モデルをダウンロードして使う（${total} MB）`, `Download and use the model (${total} MB)`)}
            </Button>
            {(state.kind === 'idle' || state.kind === 'failed') && anyKept && (
              <Button variant="ghost" onClick={() => void remove()} disabled={removing}>
                {t('保存したモデルを削除', 'Delete the saved model')}
              </Button>
            )}
          </div>
          {!cacheAvailable && (
            <p className="text-xs text-on-surface-variant">
              {t(
                'このブラウザーはモデルを保存できないため、使うたびにダウンロードします。',
                'This browser cannot keep the model, so it is downloaded each time.',
              )}
            </p>
          )}
        </>
      ) : (
        <>
          <p className="text-sm text-on-surface-variant">
            {active
              ? t(
                  '余分な部分が入ったら「除く」にしてその部分をタップします。',
                  'If something extra is included, switch to “Leave out” and tap it.',
                )
              : t('「輪郭」を選ぶと、タップで輪郭を取れます。', 'Choose “Outline” to outline by tapping.')}
          </p>
          {active && (
            <SegmentedControl
              legend={t('タップの意味', 'A tap marks')}
              orientation="inline"
              value={foreground ? 'keep' : 'exclude'}
              onChange={(value) => onForegroundChange(value === 'keep')}
              options={[
                { value: 'keep', label: t('動物', 'Animal') },
                { value: 'exclude', label: t('除く', 'Leave out') },
              ]}
            />
          )}
          <Button variant="ghost" onClick={() => void remove()} disabled={removing}>
            {t('保存したモデルを削除', 'Delete the saved model')}
          </Button>
        </>
      )}
      <p role="status" className="text-sm">
        {status}
      </p>
    </div>
  );
}
