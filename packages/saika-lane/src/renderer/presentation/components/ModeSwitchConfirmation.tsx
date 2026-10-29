// SPDX-License-Identifier: MIT
import { useEffect, useRef } from 'react';

import { Button } from '@/renderer/presentation/components/common/Button';
import { Modal } from '@/renderer/presentation/components/common/Modal';

interface ModeSwitchConfirmationProps {
  message: string | null;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
}

export function ModeSwitchConfirmation({ message, onConfirm, onCancel }: ModeSwitchConfirmationProps) {
  const confirmedKeyCode = useRef<string | null>(null);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!message && !(event.repeat && event.code === confirmedKeyCode.current)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.repeat) return;
      if (event.key === 'Enter' || event.code === 'Enter' || event.code === 'NumpadEnter') {
        confirmedKeyCode.current = event.code;
        void onConfirm();
      } else {
        onCancel();
      }
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code === confirmedKeyCode.current) confirmedKeyCode.current = null;
    };
    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('keyup', handleKeyUp, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('keyup', handleKeyUp, true);
    };
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
