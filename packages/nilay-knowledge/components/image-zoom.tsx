'use client';
// cspell:words photoswipe Zoomable

import * as Dialog from '@radix-ui/react-dialog';
import { X, ZoomIn } from 'lucide-react';
import type PhotoSwipe from 'photoswipe';
import { useEffect, useRef, useState } from 'react';

type ZoomImage = { src: string; alt: string; description: string; illustration: boolean };

/** Radix owns the modal and focus; PhotoSwipe owns image zooming and panning. */
function ImageViewer({ image }: { image: ZoomImage }) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const captionRef = useRef<HTMLParagraphElement>(null);
  const viewerRef = useRef<PhotoSwipe | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [zoomed, setZoomed] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current!;
    let disposed = false;
    let viewer: PhotoSwipe | undefined;
    const original = new Image();
    original.src = image.src;

    async function open() {
      try {
        const [{ default: PhotoSwipe }] = await Promise.all([import('photoswipe'), original.decode()]);
        if (disposed) return;
        if (!original.naturalWidth || !original.naturalHeight) throw new Error('Missing image dimensions');
        const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        viewer = new PhotoSwipe({
          dataSource: [
            { src: image.src, alt: image.alt, width: original.naturalWidth, height: original.naturalHeight },
          ],
          appendToEl: canvas,
          bgOpacity: 0,
          showHideAnimationType: 'none',
          zoomAnimationDuration: reducedMotion ? 0 : 200,
          paddingFn: () => ({
            top: (headerRef.current?.offsetHeight ?? 0) + 16,
            bottom: (captionRef.current?.offsetHeight ?? 0) + 16,
            left: 16,
            right: 16,
          }),
          secondaryZoomLevel: (levels) => Math.max(1, levels.initial * 2),
          maxZoomLevel: (levels) => Math.max(4, levels.initial * 4),
          close: false,
          zoom: false,
          arrowPrev: false,
          arrowNext: false,
          counter: false,
          escKey: false,
          arrowKeys: false,
          trapFocus: false,
          returnFocus: false,
          closeOnVerticalDrag: false,
          pinchToClose: false,
          clickToCloseNonZoomable: false,
          bgClickAction: false,
          tapAction: 'zoom',
        });
        // Let Radix handle Tab/Escape, and keep caption scrolling independent of image panning.
        viewer.on('keydown', (event) => {
          const key = event.originalEvent;
          if (key.defaultPrevented || key.isComposing || !canvas.contains(key.target as Node) || key.key === 'Tab') {
            event.preventDefault();
          }
        });
        viewer.on('zoomPanUpdate', () => {
          const slide = viewer?.currSlide;
          setZoomed(Boolean(slide && slide.currZoomLevel > slide.zoomLevels.initial + 0.01));
        });
        viewer.init();
        // This is an image surface inside the existing, named Radix dialog.
        viewer.element?.removeAttribute('role');
        viewer.scrollWrap?.removeAttribute('aria-roledescription');
        viewerRef.current = viewer;
        setState('ready');
      } catch {
        if (!disposed) setState('error');
        viewer?.destroy();
      }
    }
    void open();
    return () => {
      disposed = true;
      viewerRef.current = null;
      viewer?.destroy();
    };
  }, [image]);

  return (
    <>
      <div
        ref={canvasRef}
        role="region"
        aria-label="画像（拡大後は矢印キーで移動できます）"
        tabIndex={state === 'ready' ? 0 : -1}
        className={`image-zoom-canvas absolute inset-0 focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-white${image.illustration ? ' image-zoom-illustration' : ''}`}
      />
      <div
        ref={headerRef}
        className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-between gap-2 bg-slate-900 p-4"
      >
        <Dialog.Title className="text-lg font-bold">画像を拡大</Dialog.Title>
        <div className="pointer-events-auto flex shrink-0 gap-2">
          <Dialog.Close asChild>
            <button
              type="button"
              aria-label="拡大画像を閉じる"
              className="min-h-11 min-w-11 rounded-full p-3 hover:bg-slate-700 focus-visible:outline-2 focus-visible:outline-white"
            >
              <X className="h-6 w-6" aria-hidden="true" />
            </button>
          </Dialog.Close>
          <button
            type="button"
            aria-label="画像を拡大・縮小"
            aria-pressed={zoomed}
            disabled={state !== 'ready'}
            onClick={() => viewerRef.current?.toggleZoom()}
            className="min-h-11 min-w-11 rounded-full p-3 hover:bg-slate-700 focus-visible:outline-2 focus-visible:outline-white disabled:opacity-50"
          >
            <ZoomIn className="h-6 w-6" aria-hidden="true" />
          </button>
        </div>
      </div>
      {state !== 'ready' && (
        <p
          role={state === 'error' ? 'alert' : 'status'}
          className="pointer-events-none absolute inset-x-4 top-1/2 text-center"
        >
          {state === 'error'
            ? '画像を読み込めませんでした。閉じてからもう一度お試しください。'
            : '画像を読み込んでいます…'}
        </p>
      )}
      <Dialog.Description
        ref={captionRef}
        tabIndex={0}
        className="absolute inset-x-0 bottom-0 z-10 max-h-[25dvh] overflow-y-auto bg-slate-900 p-4 text-center text-sm [overflow-wrap:anywhere] focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-white"
      >
        {image.description}
      </Dialog.Description>
    </>
  );
}

export function ImageZoom() {
  const [image, setImage] = useState<ZoomImage | null>(null);
  const openerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const cleanups = Array.from(document.querySelectorAll<HTMLImageElement>('.prose img')).flatMap((img) => {
      if (!img.alt.trim() || img.closest('a, button, [role="button"]')) return [];
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'image-zoom-trigger';
      button.setAttribute('aria-label', `${img.alt}を拡大`);
      button.setAttribute('aria-haspopup', 'dialog');
      const open = () => {
        openerRef.current = button;
        const description = (img.getAttribute('aria-details') ?? img.getAttribute('aria-describedby') ?? '')
          .split(/\s+/)
          .flatMap((id) => document.getElementById(id)?.textContent?.trim() || [])
          .join(' ');
        setImage({
          src: img.currentSrc || img.src,
          alt: img.alt,
          description: description || img.alt,
          illustration: img.classList.contains('content-illustration'),
        });
      };
      button.addEventListener('click', open);
      img.replaceWith(button);
      button.append(img);
      return [
        () => {
          button.removeEventListener('click', open);
          button.replaceWith(img);
        },
      ];
    });
    return () => cleanups.forEach((cleanup) => cleanup());
  }, []);

  return (
    <Dialog.Root
      open={image !== null}
      onOpenChange={(open) => {
        if (!open) setImage(null);
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[70] bg-black/90 print:hidden" />
        <Dialog.Content
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (openerRef.current?.isConnected) openerRef.current.focus({ preventScroll: true });
          }}
          className="fixed inset-0 z-[70] bg-slate-900 text-white print:hidden"
        >
          {image && <ImageViewer image={image} />}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
