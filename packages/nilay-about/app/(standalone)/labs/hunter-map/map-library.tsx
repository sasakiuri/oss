'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { LuFileUp, LuTrash2 } from 'react-icons/lu';

import { NumberField, SelectField } from '@/components/labs';
import { Button } from '@/components/ui';
import { eraYear, fiscalYearEnded } from '@/lib/hunter-map';
import { readImageSize } from '@/lib/hunter-map-storage';
import { openPdf, type OpenedPdf } from '@/lib/pdf-render';
import { MAP_NAME_MAX, hunterMapImageTypes } from '@/lib/schemas/hunter-map';
import type { Language } from '@/store';

import { newImageId, selectSetup, useHunterMapStore } from './_store';

type Notice = 'reading' | 'unsupported' | 'unreadable' | 'pdf-unreadable' | null;

/** Resolutions a PDF page can be drawn at, by its longer side in pixels. */
const pdfSizes = [3000, 5000, 7000] as const;

interface PendingPdf {
  pdf: OpenedPdf;
  name: string;
  page: number;
  longSide: (typeof pdfSizes)[number];
}

const baseName = (fileName: string) => fileName.replace(/\.[^.]+$/, '').slice(0, MAP_NAME_MAX);

/**
 * The saved maps: add one from a picture or a page of a PDF, switch between them, name each, set
 * the year it is for, and delete it.
 */
export function MapLibrary({ language, today }: { language: Language; today: { year: number; month: number } | null }) {
  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);
  const { setups, activeId } = useHunterMapStore();
  const setup = selectSetup({ setups, activeId });
  const { addMap, openMap, deleteMap, renameMap, setFiscalYear } = useHunterMapStore.getState();
  const [notice, setNotice] = useState<Notice>(null);
  const [pending, setPending] = useState<PendingPdf | null>(null);
  const [rendering, setRendering] = useState(false);
  const inputId = useId();
  const onPage = useRef(true);
  useEffect(() => {
    onPage.current = true;
    return () => {
      onPage.current = false;
    };
  }, []);
  // A PDF is closed once it is done with: loaded, cancelled, replaced, or the page left.
  const pendingPdf = pending?.pdf ?? null;
  useEffect(() => () => void pendingPdf?.close(), [pendingPdf]);

  const addPicture = async (blob: Blob, type: (typeof hunterMapImageTypes)[number], name: string) => {
    const [size, data] = await Promise.all([readImageSize(blob), blob.arrayBuffer()]);
    if (!onPage.current) return false;
    if (!size) {
      setNotice('unreadable');
      return false;
    }
    addMap({ id: newImageId(), data, type, name, width: size.width, height: size.height }, name);
    return true;
  };

  const choose = async (file: File | null) => {
    if (!file) return;
    setPending(null);
    if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
      setNotice('reading');
      try {
        const pdf = await openPdf(await file.arrayBuffer());
        if (!onPage.current) return void pdf.close();
        setNotice(null);
        setPending({ pdf, name: baseName(file.name), page: 1, longSide: pdfSizes[1] });
      } catch {
        if (onPage.current) setNotice('pdf-unreadable');
      }
      return;
    }
    const type = hunterMapImageTypes.find((candidate) => candidate === file.type);
    if (!type) {
      setNotice('unsupported');
      return;
    }
    setNotice('reading');
    if (await addPicture(file, type, baseName(file.name))) setNotice(null);
  };

  const renderPending = async () => {
    if (!pending) return;
    setRendering(true);
    try {
      const page = await pending.pdf.renderPage(pending.page, pending.longSide);
      const name = pending.pdf.pageCount > 1 ? `${pending.name} p.${pending.page}` : pending.name;
      if (await addPicture(page.blob, 'image/png', name.slice(0, MAP_NAME_MAX))) {
        setPending(null);
        setNotice(null);
      }
    } catch {
      if (onPage.current) setNotice('pdf-unreadable');
    } finally {
      if (onPage.current) setRendering(false);
    }
  };

  const noticeText = {
    reading: t('読み込んでいます…', 'Reading…'),
    unsupported: t('PNG・JPEG の画像か PDF を選んでください。', 'Choose a PNG or JPEG image, or a PDF.'),
    unreadable: t(
      'この画像を読み込めませんでした。別の画像を選んでください。',
      'Could not read this image. Choose another.',
    ),
    'pdf-unreadable': t(
      'この PDF を読み込めませんでした。パスワード付きや壊れた PDF は読めません。',
      'Could not read this PDF. Password-protected or damaged PDFs cannot be read.',
    ),
  } as const;

  const expired = setup?.fiscalYear != null && today !== null && fiscalYearEnded(setup.fiscalYear, today);
  const era = setup?.fiscalYear != null ? eraYear(setup.fiscalYear) : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <input
          id={inputId}
          type="file"
          accept="image/png,image/jpeg,application/pdf"
          className="peer sr-only"
          onChange={(event) => {
            void choose(event.target.files?.[0] ?? null);
            event.target.value = '';
          }}
        />
        <label
          htmlFor={inputId}
          className="inline-flex min-h-12 cursor-pointer items-center gap-2 rounded-full border border-outline px-6 text-sm font-medium text-primary hover:bg-[color-mix(in_srgb,var(--md-sys-color-primary)_8%,transparent)] peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary"
        >
          <LuFileUp aria-hidden="true" className="size-[18px]" />
          {setups.length > 0
            ? t('位置図を追加', 'Add a map')
            : t('位置図を選ぶ（画像・PDF）', 'Choose a map (image or PDF)')}
        </label>
      </div>
      {notice && (
        <p
          role={notice === 'reading' ? 'status' : 'alert'}
          className={notice === 'reading' ? 'text-sm' : 'text-sm text-destructive'}
        >
          {noticeText[notice]}
        </p>
      )}
      {pending && (
        <div className="space-y-3 rounded-sm border border-outline-variant p-4">
          <p className="text-sm font-medium">
            {t(
              `「${pending.name}」（${pending.pdf.pageCount} ページ）の、どのページを読み込むか選んでください。`,
              `Choose which page of “${pending.name}” (${pending.pdf.pageCount} pages) to load.`,
            )}
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <NumberField
              label={t('ページ', 'Page')}
              value={pending.page}
              min={1}
              max={pending.pdf.pageCount}
              step={1}
              invalid={!(Number.isInteger(pending.page) && pending.page >= 1 && pending.page <= pending.pdf.pageCount)}
              errorText={t(`1〜${pending.pdf.pageCount} です。`, `1 to ${pending.pdf.pageCount}.`)}
              onChange={(page) => setPending({ ...pending, page })}
            />
            <SelectField
              label={t('解像度（長い辺）', 'Resolution (longer side)')}
              value={String(pending.longSide)}
              onChange={(value) => setPending({ ...pending, longSide: Number(value) as (typeof pdfSizes)[number] })}
              options={pdfSizes.map((size) => ({ value: String(size), label: `${size.toLocaleString(language)} px` }))}
              hint={t('細かい文字を読むなら大きく。', 'Larger for small print.')}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={
                rendering ||
                !(Number.isInteger(pending.page) && pending.page >= 1 && pending.page <= pending.pdf.pageCount)
              }
              onClick={() => void renderPending()}
            >
              {rendering ? t('変換中…', 'Converting…') : t('このページを読み込む', 'Load this page')}
            </Button>
            <Button variant="outline" onClick={() => setPending(null)}>
              {t('やめる', 'Cancel')}
            </Button>
          </div>
          <p className="text-xs text-on-surface-variant">
            {t(
              '分割された位置図は、ページごとに別の地図として追加してください。',
              'For a map split across pages, add each page as its own map.',
            )}
          </p>
        </div>
      )}
      {setups.length > 0 && setup && (
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label={t('開いている地図', 'Open map')}
            value={setup.id}
            onChange={(id) => void openMap(id)}
            options={setups.map((entry, index) => ({
              value: entry.id,
              label: entry.name || t(`地図 ${index + 1}`, `Map ${index + 1}`),
            }))}
          />
          <div className="min-w-0 space-y-2">
            <label htmlFor={`${inputId}-name`} className="block text-sm font-medium">
              {t('地図の名前', 'Map name')}
            </label>
            <input
              id={`${inputId}-name`}
              type="text"
              maxLength={MAP_NAME_MAX}
              value={setup.name}
              onChange={(event) => renameMap(event.target.value)}
            />
          </div>
          <NumberField
            label={t('位置図の年度（西暦）', 'Fiscal year of the map')}
            value={setup.fiscalYear ?? NaN}
            min={1989}
            max={2100}
            step={1}
            invalid={setup.fiscalYear === null ? false : !(setup.fiscalYear >= 1989 && setup.fiscalYear <= 2100)}
            errorText={t('1989〜2100 の年です。', 'A year from 1989 to 2100.')}
            hint={
              era
                ? t(
                    `${era.era}${era.year === 1 ? '元' : era.year}年度（${setup.fiscalYear}年4月〜翌年3月）`,
                    `${era.era} ${era.year} (April ${setup.fiscalYear} to March ${setup.fiscalYear! + 1})`,
                  )
                : t('表紙の「令和○年度」を西暦で。令和7年度は 2025。', 'The year on the cover; 令和7年度 is 2025.')
            }
            onChange={(value) =>
              setFiscalYear(Number.isInteger(value) && value >= 1989 && value <= 2100 ? value : null)
            }
          />
          <div className="flex items-end">
            <Button
              variant="outline"
              onClick={() => {
                const ok = window.confirm(
                  t(
                    `「${setup.name}」を、基準点・区域とともに削除します。よろしいですか？`,
                    `Delete “${setup.name}” with its points and areas?`,
                  ),
                );
                if (ok) void deleteMap(setup.id);
              }}
            >
              <LuTrash2 aria-hidden="true" />
              {t('この地図を削除', 'Delete this map')}
            </Button>
          </div>
        </div>
      )}
      {expired && setup?.fiscalYear != null && (
        <p role="alert" className="rounded-sm bg-error-container p-3 text-sm text-on-error-container">
          {t(
            `この位置図は ${setup.fiscalYear} 年度（${era!.era}${era!.year === 1 ? '元' : era!.year}年度）のもので、年度が終わっています。今年度の位置図を入手してください。`,
            `This map is for fiscal year ${setup.fiscalYear}, which has ended. Get this year's map.`,
          )}
        </p>
      )}
    </div>
  );
}
