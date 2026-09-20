'use client';

import { X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

export function ImageZoom() {
  const [isOpen, setIsOpen] = useState(false);
  const [imageSrc, setImageSrc] = useState('');
  const [imageAlt, setImageAlt] = useState('');

  const openModal = useCallback((src: string, alt: string) => {
    setImageSrc(src);
    setImageAlt(alt);
    setIsOpen(true);
    document.body.style.overflow = 'hidden';
  }, []);

  const closeModal = useCallback(() => {
    setIsOpen(false);
    document.body.style.overflow = '';
  }, []);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;

      // Check if clicked element is an image inside .prose
      if (target.tagName === 'IMG' && target.closest('.prose')) {
        const img = target as HTMLImageElement;
        openModal(img.src, img.alt);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        closeModal();
      }
    };

    document.addEventListener('click', handleClick);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('click', handleClick);
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, openModal, closeModal]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
      onClick={closeModal}
      role="dialog"
      aria-modal="true"
      aria-label={imageAlt || '拡大画像'}
    >
      {/* Close button */}
      <button
        onClick={closeModal}
        className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20"
        aria-label="閉じる"
      >
        <X className="h-6 w-6" />
      </button>

      {/* Image */}
      {/* The zoom dialog displays the original image at its natural dimensions. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={imageSrc}
        alt={imageAlt}
        className="max-h-[90vh] max-w-[90vw] cursor-zoom-out rounded-lg object-contain"
        onClick={(e) => {
          e.stopPropagation();
          closeModal();
        }}
      />

      {/* Alt text caption */}
      {imageAlt && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-lg bg-black/50 px-4 py-2 text-sm text-white">
          {imageAlt}
        </div>
      )}
    </div>
  );
}
