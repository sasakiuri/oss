// SPDX-License-Identifier: MIT
import { AlertTriangle, X } from 'lucide-react';
import React, { useEffect } from 'react';

import { useConnectionNotificationStore } from '@/renderer/presentation/stores/connectionNotificationStore';

export interface ConnectionWarningToastProps {
  onOpenSettings: () => void;
  className?: string;
}

export const ConnectionWarningToast: React.FC<ConnectionWarningToastProps> = ({ onOpenSettings, className = '' }) => {
  const notification = useConnectionNotificationStore((s) => s.notification);
  const dismiss = useConnectionNotificationStore((s) => s.dismiss);

  useEffect(() => {
    if (!notification) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      dismiss();
    }, 6000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [notification, dismiss]);

  if (!notification) {
    return null;
  }

  return (
    <div
      className={`fixed bottom-16 right-4 z-50 w-[360px] rounded-md border border-amber-500/40 bg-zinc-900/95 shadow-2xl shadow-black/40 ${className}`.trim()}
      role="alert"
      aria-live="polite"
      aria-atomic="true"
    >
      <div className="flex items-start gap-3 p-4">
        <div className="mt-0.5 rounded bg-amber-500/15 p-1.5 text-amber-300">
          <AlertTriangle size={18} />
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-zinc-100">{notification.title}</p>
          <p className="mt-1 text-sm leading-5 text-zinc-300">{notification.message}</p>

          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                dismiss();
                onOpenSettings();
              }}
              className="rounded bg-amber-500 px-3 py-1.5 text-sm font-medium text-zinc-950 transition-colors hover:bg-amber-400"
            >
              Open Connection Settings
            </button>
            <button
              type="button"
              onClick={dismiss}
              className="rounded px-3 py-1.5 text-sm text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
            >
              Dismiss
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={dismiss}
          className="rounded p-1 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
          aria-label="Dismiss connection warning"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
};
