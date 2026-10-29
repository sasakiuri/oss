// SPDX-License-Identifier: MIT
import { useEffect } from 'react';

import { Button } from '@/renderer/presentation/components/common/Button';
import { Modal } from '@/renderer/presentation/components/common/Modal';

interface ModeSwitchConfirmationProps {
  message: string | null;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
}

export function ModeSwitchConfirmation({ message, onConfirm, onCancel }: ModeSwitchConfirmationProps) {
  useEffect(() => {
    if (!message) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.repeat) return;
      if (event.key === 'Enter' || event.code === 'Enter' || event.code === 'NumpadEnter') {
        void onConfirm();
      } else {
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [message, onConfirm, onCancel]);

  return (
    <Modal isOpen={message !== null} onClose={onCancel} title="Confirm mode change">
      <p>{message}</p>
      <p className="mt-2 text-sm">Press Enter to confirm. Any other key or 5 seconds without an answer cancels.</p>
      <div className="mt-6 flex justify-end gap-3">
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={() => void onConfirm()}>Confirm</Button>
      </div>
    </Modal>
  );
}
