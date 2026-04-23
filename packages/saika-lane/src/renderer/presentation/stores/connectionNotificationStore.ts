// SPDX-License-Identifier: MIT
import { create } from 'zustand';

interface ConnectionNotification {
  id: number;
  title: string;
  message: string;
}

interface ConnectionNotificationState {
  notification: ConnectionNotification | null;
}

interface ConnectionNotificationActions {
  showUnexpectedDisconnect: (reason?: string) => void;
  dismiss: () => void;
}

const DEFAULT_MESSAGE =
  'The target connection was lost. Open Connection settings, refresh the port list, and reconnect manually.';

export const useConnectionNotificationStore = create<ConnectionNotificationState & ConnectionNotificationActions>(
  (set) => ({
    notification: null,

    showUnexpectedDisconnect: (reason) => {
      const detail = reason && reason !== 'User requested disconnection' ? reason : DEFAULT_MESSAGE;
      set({
        notification: {
          id: Date.now(),
          title: 'Target Disconnected',
          message: detail,
        },
      });
    },

    dismiss: () => {
      set({ notification: null });
    },
  }),
);
