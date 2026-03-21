// SPDX-License-Identifier: MIT
import React, { useRef } from 'react';

import { useBodyScrollLock } from '@/renderer/presentation/hooks/useBodyScrollLock';
import { useEscapeKey } from '@/renderer/presentation/hooks/useEscapeKey';
import { useFocusTrap } from '@/renderer/presentation/hooks/useFocusTrap';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  className?: string;
}

/**
 * Modal dialog component with overlay and keyboard support
 */
export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children, className = '' }) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const titleId = React.useId();

  useEscapeKey(isOpen, onClose);
  useFocusTrap(isOpen, modalRef);
  useBodyScrollLock(isOpen);

  if (!isOpen) {
    return null;
  }

  const handleBackgroundClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50"
      onClick={handleBackgroundClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div
        ref={modalRef}
        className={`mx-4 max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-vscode-border bg-vscode-bg-light shadow-xl ${className}`.trim()}
        tabIndex={-1}
      >
        <div className="flex items-center justify-between border-b border-vscode-border px-6 py-4">
          <h2 id={titleId} className="text-xl font-semibold text-vscode-text">
            {title}
          </h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-vscode-text-muted transition-colors hover:text-vscode-text focus:outline-none focus:ring-2 focus:ring-vscode-primary"
            aria-label="Close modal"
          >
            <svg
              className="h-6 w-6"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="px-6 py-4 text-vscode-text">{children}</div>
      </div>
    </div>
  );
};
