import { SCHEDULED_CHECKS_PAUSED, SCHEDULED_CHECKS_PAUSED_MESSAGE } from '@/lib/scheduled-checks';

/** Says, where a tool registers for a scheduled check, that registering is paused. Nothing when it is not. */
export function ScheduledChecksPaused({ language }: { language: 'ja' | 'en' }) {
  if (!SCHEDULED_CHECKS_PAUSED) return null;
  return (
    <p role="note" className="rounded-sm border border-outline-variant bg-surface-container p-3 text-sm">
      {SCHEDULED_CHECKS_PAUSED_MESSAGE[language]}
    </p>
  );
}
