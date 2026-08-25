import { useEffect, useId, useRef } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useConfirmDialogStore } from '../../../stores/ui/confirmDialog.store';

export function ConfirmDialog() {
  const { isOpen, message, handleConfirm, handleCancel } = useConfirmDialogStore();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (isOpen) {
      previousFocusRef.current = document.activeElement as HTMLElement;
      requestAnimationFrame(() => cancelRef.current?.focus());
      return;
    }
    if (previousFocusRef.current) {
      previousFocusRef.current.focus();
      previousFocusRef.current = null;
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleCancel();
        return;
      }
      if (e.key !== 'Tab' || !cancelRef.current || !confirmRef.current) return;
      if (e.shiftKey && document.activeElement === cancelRef.current) {
        e.preventDefault();
        confirmRef.current.focus();
      } else if (!e.shiftKey && document.activeElement === confirmRef.current) {
        e.preventDefault();
        cancelRef.current.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleCancel]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={handleCancel} aria-hidden="true" />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="relative w-full max-w-md rounded-sm border border-vscode-border bg-vscode-bg-light p-5 shadow-2xl shadow-black/60"
      >
        <div className="mb-5 flex items-start gap-3">
          <span className="mt-0.5 shrink-0 text-vscode-warning">
            <AlertTriangle size={18} aria-hidden="true" />
          </span>
          <div>
            <h2 id={titleId} className="text-sm font-semibold text-vscode-text">
              Confirm
            </h2>
            <p id={descriptionId} className="mt-1 whitespace-pre-wrap text-[13px] leading-5 text-vscode-text-muted">
              {message}
            </p>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            ref={cancelRef}
            onClick={handleCancel}
            className="min-h-9 rounded-[3px] border border-vscode-border bg-transparent px-3 py-1.5 text-[13px] font-medium text-vscode-text transition-colors hover:bg-vscode-bg-hover"
          >
            Cancel
          </button>
          <button
            type="button"
            ref={confirmRef}
            onClick={handleConfirm}
            className="min-h-9 rounded-[3px] border border-vscode-primary bg-vscode-primary px-3 py-1.5 text-[13px] font-medium text-white transition-colors hover:border-vscode-primary-hover hover:bg-vscode-primary-hover"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}
