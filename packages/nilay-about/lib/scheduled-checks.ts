/**
 * The scheduled checks (Vercel Cron: bear sightings, course pages, overdue return plans) are paused:
 * the Hobby plan refuses schedules that run more than once a day, so `vercel.json` lists none. While
 * they are paused, the tools that rely on them take no new registrations, on the page and on the
 * server, so no one registers for an alert that would never come. Set to false once the crons are back.
 */
export const SCHEDULED_CHECKS_PAUSED = true;

export const SCHEDULED_CHECKS_PAUSED_MESSAGE = {
  ja: '定期確認を一時停止しているため、現在は新しい登録を受け付けていません。登録済みの内容の解除はできます。',
  en: 'The scheduled checks are paused, so new registrations are not accepted for now. Existing ones can still be removed.',
} as const;
