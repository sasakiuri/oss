import 'server-only';

import { env } from '@/lib/env';
import { SCHEDULED_CHECKS_PAUSED } from '@/lib/scheduled-checks';
import { getLabsStore } from '@/lib/server/store';
import { createPushSender } from '@/lib/server/web-push';

import { createBearAlerts } from './bear-alerts';
import { createCourseWatch } from './course-watch';
import { createEventResults } from './event-results';
import { createLabsNotifyHandlers } from './handlers';
import { createLocationRooms } from './location-room';
import { createPushService } from './push';
import { createReturnAlerts } from './return-alert';
import { createTrapHooks } from './trap-hooks';

/** The Labs server features wired to the real environment. Tests build them with their own stand-ins. */
const push = createPushService({
  store: getLabsStore,
  send: createPushSender({
    vapid: () =>
      env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.VAPID_SUBJECT
        ? { publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY, subject: env.VAPID_SUBJECT }
        : null,
  }),
});

export const labsNotify = createLabsNotifyHandlers({
  siteUrl: () => env.NEXT_PUBLIC_SITE_URL ?? '',
  vapidPublicKey: () => env.VAPID_PUBLIC_KEY,
  cronSecret: () => env.CRON_SECRET,
  scheduledChecksPaused: () => SCHEDULED_CHECKS_PAUSED,
  push,
  bear: createBearAlerts({ store: getLabsStore, push }),
  course: createCourseWatch({ store: getLabsStore, push }),
  returns: createReturnAlerts({ store: getLabsStore, push }),
  rooms: createLocationRooms({ store: getLabsStore }),
  hooks: createTrapHooks({ store: getLabsStore, push }),
  results: createEventResults({ store: getLabsStore }),
});
