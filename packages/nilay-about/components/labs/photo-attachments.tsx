'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { LuImagePlus, LuTrash2 } from 'react-icons/lu';

import { Button } from '@/components/ui';
import { preparePhoto } from '@/lib/photo-resize';
import {
  PhotoLimitError,
  PhotoOwnerDeletedError,
  addPhoto,
  deletePhoto,
  listPhotos,
  photoOwnerTicket,
  type PhotoOwnerTicket,
} from '@/lib/photo-storage';
import { PHOTOS_PER_RECORD_MAX, PHOTO_MAX_EDGE } from '@/lib/schemas/photos';

type Language = 'ja' | 'en';

interface PhotoAttachmentsProps {
  language: Language;
  /** The tool's slug. Photos are kept per tool and per record. */
  tool: string;
  /** The record the photos belong to. */
  ownerId: string;
  /** The localStorage key the tool saves its records under, where a photo's record is looked for (`photoOwnerTicket`). */
  savedIn: string;
  /** What the record is, as a reader would name it, for the labels read aloud (“the outing of 1 Nov”). */
  ownerLabel: string;
  /** A tool's own lower limit per record, such as the room on a printed sheet. At most `PHOTOS_PER_RECORD_MAX`. */
  maxPhotos?: number;
  /** Told after a photo is added or deleted, for a tool that shows the photos elsewhere too (a print). */
  onChange?: () => void;
  /**
   * For a tool whose record may not be saved yet (a form filled in place): saves it and says whether it
   * is on disk. A photo is kept under its record's id, so a photo of a record that was never saved would
   * be left behind with nothing to show it once the page reloads.
   */
  ensureOwnerSaved?: () => boolean;
}

interface ShownPhoto {
  id: string;
  url: string;
  width: number;
  height: number;
}

type Problem = 'unavailable' | 'unreadable' | 'full' | 'write-failed' | 'discarded' | 'owner-unsaved' | 'owner-deleted';

/**
 * Photos on one record: add from the device (or its camera, which the file picker offers on a phone),
 * look at them, and delete them.
 *
 * The photos stay in this browser. Each is scaled down and re-encoded before it is kept, which drops
 * the position a phone writes into its pictures; the backup on the Labs data page carries them to
 * another device.
 */
export function PhotoAttachments({
  language,
  tool,
  ownerId,
  savedIn,
  ownerLabel,
  maxPhotos = PHOTOS_PER_RECORD_MAX,
  onChange,
  ensureOwnerSaved,
}: PhotoAttachmentsProps) {
  const limit = Math.min(maxPhotos, PHOTOS_PER_RECORD_MAX);
  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);
  const inputId = useId();
  const [photos, setPhotos] = useState<ShownPhoto[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [message, setMessage] = useState<[ja: string, en: string] | null>(null);
  const [enlarged, setEnlarged] = useState<string | null>(null);
  // Object URLs hold the pictures in memory until they are revoked, so they are tracked and let go.
  const urls = useRef<string[]>([]);
  const mounted = useRef(true);
  // The record on screen: replaced when another record is shown, and let go when the field is unmounted.
  // `mounted` alone is true again once another record is shown, such as the blank one after a deletion.
  const shown = useRef<{ live: boolean }>({ live: false });

  const release = () => {
    for (const url of urls.current) URL.revokeObjectURL(url);
    urls.current = [];
  };

  const refresh = useCallback(async () => {
    try {
      const list = await listPhotos(tool, ownerId);
      if (!mounted.current) return;
      release();
      const shown = list.photos.map((photo) => {
        const url = URL.createObjectURL(new Blob([photo.data], { type: photo.type }));
        urls.current.push(url);
        return { id: photo.id, url, width: photo.width, height: photo.height };
      });
      setPhotos(shown);
      if (list.discarded > 0) setProblem('discarded');
    } catch {
      if (mounted.current) setProblem('unavailable');
    } finally {
      if (mounted.current) setLoaded(true);
    }
  }, [tool, ownerId]);

  useEffect(() => {
    const current = { live: true };
    shown.current = current;
    mounted.current = true;
    void refresh();
    return () => {
      current.live = false;
      mounted.current = false;
      release();
    };
  }, [refresh]);

  const add = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setProblem(null);
    setMessage(null);
    if (ensureOwnerSaved && !ensureOwnerSaved()) {
      setProblem('owner-unsaved');
      return;
    }
    setBusy(true);
    // The photos are for the record on screen now. A record shown in its place, or a screen left (the tab
    // may be on the data page now), takes nothing more; a deletion of the record's photos meanwhile makes
    // `addPhoto` refuse them, so a deleted record does not get a photo back.
    const view = shown.current;
    // Asked for at once, so a deletion asked for after this click is counted after it.
    const ticketing = photoOwnerTicket(tool, ownerId, savedIn);
    let added = 0;
    try {
      let ticket: PhotoOwnerTicket;
      try {
        ticket = await ticketing;
      } catch (error) {
        if (view.live) setProblem(error instanceof PhotoOwnerDeletedError ? 'owner-deleted' : 'write-failed');
        return;
      }
      for (const file of Array.from(files)) {
        if (!view.live) break;
        const prepared = await preparePhoto(file);
        if (!view.live) break;
        if (!prepared) {
          setProblem('unreadable');
          continue;
        }
        try {
          await addPhoto(
            {
              id: crypto.randomUUID(),
              tool,
              ownerId,
              type: 'image/jpeg',
              ...prepared,
              addedAt: new Date().toISOString(),
            },
            ticket,
            limit,
          );
          added += 1;
        } catch (error) {
          if (view.live)
            setProblem(
              error instanceof PhotoLimitError
                ? 'full'
                : error instanceof PhotoOwnerDeletedError
                  ? 'owner-deleted'
                  : 'write-failed',
            );
          break;
        }
      }
    } finally {
      // Another record on screen has read its own photos already.
      if (view.live) await refresh();
      if (added > 0) onChange?.();
      if (mounted.current) setBusy(false);
      if (view.live) {
        if (added > 0)
          setMessage([`写真を ${added} 枚追加しました。`, `Added ${added} photo${added === 1 ? '' : 's'}.`]);
      }
    }
  };

  const remove = async (id: string, index: number) => {
    if (!window.confirm(t(`写真 ${index + 1} を削除しますか？`, `Delete photo ${index + 1}?`))) return;
    setProblem(null);
    try {
      await deletePhoto(id);
      onChange?.();
      setMessage(['写真を削除しました。', 'Deleted the photo.']);
    } catch {
      setProblem('write-failed');
    }
    if (enlarged === id) setEnlarged(null);
    await refresh();
  };

  const problemText = (value: Problem) =>
    ({
      unavailable: t(
        'このブラウザーでは写真を保存できません（プライベートモードなど）。',
        'This browser cannot keep photos (a private window, for example).',
      ),
      unreadable: t(
        '画像として読み込めないファイルがありました。JPEG・PNG などの写真を選んでください。',
        'A file could not be read as a picture. Choose a photo such as a JPEG or PNG.',
      ),
      full: t(`写真は 1 件の記録に ${limit} 枚までです。`, `A record holds up to ${limit} photos.`),
      'write-failed': t(
        '写真を保存できませんでした。端末の空き容量を確認してください。',
        'The photo could not be saved. Check the free space on this device.',
      ),
      discarded: t(
        '読み取れなかった写真があったため、削除しました。',
        'Some photos could not be read and were removed.',
      ),
      'owner-unsaved': t(
        '記録をこのブラウザーに保存できなかったため、写真は追加していません。',
        'The record could not be saved in this browser, so no photo was added.',
      ),
      'owner-deleted': t(
        '写真の準備中に記録の写真が削除されたため、写真は追加していません。',
        'The record’s photos were deleted while the photo was being prepared, so it was not added.',
      ),
    })[value];

  const full = photos.length >= limit;

  return (
    <div className="space-y-2">
      {photos.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label={t(`${ownerLabel}の写真`, `Photos of ${ownerLabel}`)}>
          {photos.map((photo, index) => (
            <li key={photo.id} className="relative">
              <button
                type="button"
                aria-expanded={enlarged === photo.id}
                aria-label={t(`写真 ${index + 1} を拡大`, `Enlarge photo ${index + 1}`)}
                onClick={() => setEnlarged(enlarged === photo.id ? null : photo.id)}
                className="block overflow-hidden rounded-sm border border-outline-variant"
              >
                {/* A blob URL of a picture already scaled in the browser; next/image has nothing to add. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo.url} alt="" width={96} height={96} className="size-24 object-cover" />
              </button>
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-0 top-0 bg-surface/80"
                aria-label={t(`写真 ${index + 1} を削除`, `Delete photo ${index + 1}`)}
                onClick={() => void remove(photo.id, index)}
              >
                <LuTrash2 aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      )}
      {enlarged !== null &&
        (() => {
          const index = photos.findIndex((photo) => photo.id === enlarged);
          const photo = photos[index];
          if (!photo) return null;
          return (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photo.url}
              alt={t(`${ownerLabel}の写真 ${index + 1}`, `Photo ${index + 1} of ${ownerLabel}`)}
              width={photo.width}
              height={photo.height}
              className="h-auto max-h-[70vh] w-auto max-w-full rounded-sm border border-outline-variant"
            />
          );
        })()}
      <div className="flex flex-wrap items-center gap-2">
        {/* The input is the control; the label is what is seen. It stays focusable for a keyboard. */}
        <label
          htmlFor={inputId}
          className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-full border border-outline px-4 text-sm font-medium has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50 has-[:focus-visible]:outline has-[:focus-visible]:outline-2"
        >
          <LuImagePlus aria-hidden="true" className="size-[18px]" />
          {busy ? t('写真を保存しています…', 'Saving photos…') : t('写真を追加', 'Add photos')}
          <input
            id={inputId}
            type="file"
            accept="image/*"
            multiple
            className="sr-only"
            disabled={!loaded || busy || full || problem === 'unavailable'}
            aria-label={t(`${ownerLabel}に写真を追加`, `Add photos to ${ownerLabel}`)}
            onChange={(event) => {
              const files = event.target.files;
              void add(files).finally(() => {
                // Cleared so the same file can be chosen again after it was deleted.
                event.target.value = '';
              });
            }}
          />
        </label>
        <span className="text-xs text-on-surface-variant">
          {t(
            `${photos.length}/${limit} 枚・長辺 ${PHOTO_MAX_EDGE} px に縮小し、位置情報は保存しません`,
            `${photos.length}/${limit} · scaled to ${PHOTO_MAX_EDGE} px; location data is not kept`,
          )}
        </span>
      </div>
      <p role="status" className={problem || message ? 'text-sm' : 'sr-only'}>
        {problem ? problemText(problem) : message ? t(...message) : ''}
      </p>
    </div>
  );
}

/**
 * Object URLs of a record's photos, oldest first, for a tool that shows them outside `PhotoAttachments`
 * (a printed sheet). `version` is bumped by the tool, from `onChange`, to read them again. Photos that
 * cannot be read are counted rather than shown as a gap. `ready` is true once they are read; when they
 * could not be read at all, `failed` is true instead, and the tool reads them again by bumping `version`.
 */
export function useRecordPhotoUrls(
  tool: string,
  ownerId: string,
  version = 0,
): { urls: { id: string; url: string }[]; missing: number; ready: boolean; failed: boolean } {
  const key = `${tool}\n${ownerId}\n${version}`;
  const [state, setState] = useState<{
    key: string;
    urls: { id: string; url: string }[];
    missing: number;
    failed: boolean;
  }>({ key: '', urls: [], missing: 0, failed: false });
  useEffect(() => {
    let live = true;
    const created: string[] = [];
    listPhotos(tool, ownerId)
      .then((list) => {
        if (!live) return;
        const urls = list.photos.map((photo) => {
          const url = URL.createObjectURL(new Blob([photo.data], { type: photo.type }));
          created.push(url);
          return { id: photo.id, url };
        });
        setState({ key, urls, missing: list.discarded, failed: false });
      })
      .catch(() => {
        if (live) setState({ key, urls: [], missing: 0, failed: true });
      });
    return () => {
      live = false;
      for (const url of created) URL.revokeObjectURL(url);
    };
  }, [key, tool, ownerId]);
  // Until this record's photos are read, nothing from the previous record is shown, and `ready` is false.
  if (state.key !== key) return { urls: [], missing: 0, ready: false, failed: false };
  return { urls: state.urls, missing: state.missing, ready: !state.failed, failed: state.failed };
}
