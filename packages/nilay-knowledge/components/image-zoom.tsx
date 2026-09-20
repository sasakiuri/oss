'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

export function ImageZoom() {
  const [image, setImage] = useState<{ src: string; alt: string; description: string; illustration: boolean } | null>(
    null,
  );
  const openerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    // Enhance only standalone, informative images. Linked images retain their navigation.
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
          className="fixed left-1/2 top-1/2 z-[70] max-h-[95dvh] w-[calc(100%-2rem)] max-w-5xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg bg-slate-900 p-4 text-white print:hidden"
        >
          <div className="mb-4 flex items-center justify-between gap-4">
            <Dialog.Title className="text-lg font-bold">画像を拡大</Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full hover:bg-slate-700"
                aria-label="拡大画像を閉じる"
              >
                <X className="h-6 w-6" aria-hidden="true" />
              </button>
            </Dialog.Close>
          </div>
          {image && (
            // Original content images need their natural dimensions in the viewer.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={image.src}
              alt={image.alt}
              className={`mx-auto max-h-[65dvh] max-w-full object-contain${image.illustration ? ' content-illustration' : ''}`}
            />
          )}
          <Dialog.Description className="mt-4 text-center text-sm [overflow-wrap:anywhere]">
            {image?.description}
          </Dialog.Description>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
