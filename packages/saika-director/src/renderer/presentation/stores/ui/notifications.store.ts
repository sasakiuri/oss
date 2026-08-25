import { create } from 'zustand';

export type NotificationType = 'success' | 'error' | 'warning' | 'info';

export interface Notification {
  id: string;
  type: NotificationType;
  message: string;
  createdAt: number;
}

const MAX_NOTIFICATIONS = 5;
const AUTO_DISMISS_MS = 5000;

interface NotificationState {
  notifications: Notification[];
  addNotification: (type: NotificationType, message: string) => void;
  removeNotification: (id: string) => void;
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],

  addNotification: (type, message) => {
    const id = crypto.randomUUID();
    const notification: Notification = {
      id,
      type,
      message,
      createdAt: Date.now(),
    };

    set((state) => {
      const updated = [...state.notifications, notification];
      if (updated.length > MAX_NOTIFICATIONS) {
        return { notifications: updated.slice(updated.length - MAX_NOTIFICATIONS) };
      }
      return { notifications: updated };
    });

    setTimeout(() => {
      get().removeNotification(id);
    }, AUTO_DISMISS_MS);
  },

  removeNotification: (id) => {
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    }));
  },
}));
