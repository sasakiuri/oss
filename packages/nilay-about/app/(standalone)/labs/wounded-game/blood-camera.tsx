'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { LuCamera } from 'react-icons/lu';

import { SegmentedControl } from '@/components/labs';
import { highlightRed, type HighlightColour } from '@/lib/blood-highlight';
import { ANALYSIS_MAX_SIDE } from '@/lib/image-pixels';
import type { Language } from '@/store';

type Problem = 'unreadable' | null;

/**
 * A photo of the ground with its reds picked out, to help spot blood on a trail.
 *
 * The photo is taken with the phone's own camera through the file picker, drawn on a canvas here
 * and never saved or sent: choosing another photo or leaving the page drops it.
 */
export function BloodCamera({ language }: { language: Language }) {
  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);
  const inputId = useId();
  const sensitivityId = useId();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [photo, setPhoto] = useState<ImageData | null>(null);
  const [problem, setProblem] = useState<Problem>(null);
  const [sensitivity, setSensitivity] = useState(50);
  const [colour, setColour] = useState<HighlightColour>('cyan');
  const [view, setView] = useState<'highlight' | 'original'>('highlight');
  const [share, setShare] = useState<number | null>(null);

  const readPhoto = async (file: File | null) => {
    if (!file) return;
    setProblem(null);
    try {
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, ANALYSIS_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) throw new Error('No 2D canvas');
      context.drawImage(bitmap, 0, 0, width, height);
      bitmap.close();
      setPhoto(context.getImageData(0, 0, width, height));
    } catch {
      setPhoto(null);
      setProblem('unreadable');
    }
  };

  // Redrawn whenever the photo or a setting changes; the original pixels are never overwritten.
  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context || !photo) return;
    canvas.width = photo.width;
    canvas.height = photo.height;
    if (view === 'original') {
      context.putImageData(photo, 0, 0);
      return;
    }
    const copy = new ImageData(new Uint8ClampedArray(photo.data), photo.width, photo.height);
    const marked = highlightRed(copy.data, { sensitivity, colour });
    context.putImageData(copy, 0, 0);
    // The share is what the picture shows; it is kept for the caption, not computed in render.
    window.requestAnimationFrame(() => setShare(marked));
  }, [photo, sensitivity, colour, view]);

  return (
    <div className="space-y-4">
      <div>
        <input
          id={inputId}
          type="file"
          accept="image/*"
          capture="environment"
          className="peer sr-only"
          onChange={(event) => {
            void readPhoto(event.target.files?.[0] ?? null);
            event.target.value = '';
          }}
        />
        <label
          htmlFor={inputId}
          className="inline-flex min-h-12 cursor-pointer items-center gap-2 rounded-full border border-outline px-6 text-sm font-medium text-primary hover:bg-[color-mix(in_srgb,var(--md-sys-color-primary)_8%,transparent)] peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary"
        >
          <LuCamera aria-hidden="true" className="size-[18px]" />
          {photo
            ? t('撮り直す・別の写真', 'Take or choose another')
            : t('撮影する・写真を選ぶ', 'Take or choose a photo')}
        </label>
      </div>
      {problem && (
        <p role="alert" className="text-sm text-destructive">
          {t('この写真を読み込めませんでした。', 'Could not read this photo.')}
        </p>
      )}
      {photo && (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label htmlFor={sensitivityId} className="block text-sm font-medium">
                {t(`感度 ${sensitivity}`, `Sensitivity ${sensitivity}`)}
              </label>
              <input
                id={sensitivityId}
                type="range"
                min={0}
                max={100}
                step={5}
                value={sensitivity}
                onChange={(event) => setSensitivity(Number(event.target.value))}
                className="w-full"
              />
            </div>
            <SegmentedControl
              legend={t('強調の色', 'Marker colour')}
              orientation="inline"
              value={colour}
              options={[
                { value: 'cyan', label: t('水色', 'Cyan') },
                { value: 'yellow', label: t('黄', 'Yellow') },
              ]}
              onChange={(value) => setColour(value as HighlightColour)}
            />
          </div>
          <SegmentedControl
            legend={t('表示', 'Show')}
            orientation="inline"
            value={view}
            options={[
              { value: 'highlight', label: t('強調', 'Highlighted') },
              { value: 'original', label: t('元の写真', 'Original') },
            ]}
            onChange={(value) => setView(value as 'highlight' | 'original')}
          />
          <canvas
            ref={canvasRef}
            role="img"
            aria-label={t('赤を強調した地面の写真', 'Photo of the ground with reds picked out')}
            className="h-auto w-full rounded-sm border border-outline-variant"
          />
          {view === 'highlight' && share !== null && (
            <p className="text-sm" role="status">
              {t(
                `強調した部分は写真の ${(share * 100).toFixed(1)}% です。`,
                `${(share * 100).toFixed(1)}% of the photo is marked.`,
              )}
            </p>
          )}
        </>
      )}
      <p className="text-xs text-on-surface-variant">
        {t(
          '赤い落ち葉・木の実・さび・土も強調され、黒ずんだ古い血や暖色の照明下の血は強調されないことがあります。',
          'Red leaves, berries, rust and soil light up too, and old darkened blood or blood under warm light may not.',
        )}
      </p>
    </div>
  );
}
