import { useEffect, useState } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { useNotificationStore, type Notification, type NotificationType } from '../../../stores/ui/notifications.store';

const typeStyles: Record<NotificationType, string> = {
  success: 'border-l-vscode-success text-vscode-success',
  error: 'border-l-vscode-error text-vscode-error',
  warning: 'border-l-vscode-warning text-vscode-warning',
  info: 'border-l-vscode-primary text-vscode-accent',
};

const typeIcons = {
  success: CheckCircle2,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};

function NotificationItem({ notification }: { notification: Notification }) {
  const removeNotification = useNotificationStore((s) => s.removeNotification);
  const [visible, setVisible] = useState(false);
  const Icon = typeIcons[notification.type];

  useEffect(() => {
    const frame = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const handleClose = () => {
    setVisible(false);
    setTimeout(() => removeNotification(notification.id), 200);
  };

  return (
    <div
      role={notification.type === 'error' ? 'alert' : 'status'}
      className={`${typeStyles[notification.type]} flex min-w-[300px] max-w-md items-start gap-2.5 rounded-sm border border-vscode-border border-l-2 bg-vscode-bg-light px-3 py-2.5 shadow-xl shadow-black/40 transition-all duration-150 ${
        visible ? 'translate-x-0 opacity-100' : 'translate-x-2 opacity-0'
      }`}
    >
      <Icon size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
      <span className="min-w-0 flex-1 break-words text-[13px] leading-5 text-vscode-text">{notification.message}</span>
      <button
        type="button"
        onClick={handleClose}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-vscode-text-muted transition-colors hover:bg-vscode-hover hover:text-vscode-text"
        aria-label="Dismiss notification"
      >
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  );
}

export function NotificationContainer() {
  const notifications = useNotificationStore((s) => s.notifications);

  if (notifications.length === 0) return null;

  return (
    <div aria-live="polite" className="fixed right-4 top-4 z-50 flex flex-col gap-2">
      {notifications.map((notification) => (
        <NotificationItem key={notification.id} notification={notification} />
      ))}
    </div>
  );
}
