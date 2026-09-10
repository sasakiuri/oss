// SPDX-License-Identifier: MIT
import * as Sentry from '@sentry/nextjs';

import { publicEnv } from './src/shared/config/env';

if (publicEnv.NEXT_PUBLIC_SENTRY_DSN)
  Sentry.init({
    dsn: publicEnv.NEXT_PUBLIC_SENTRY_DSN,
    sendDefaultPii: false,
    environment: publicEnv.NEXT_PUBLIC_APP_ENV,
    release: publicEnv.NEXT_PUBLIC_RELEASE,
    tracesSampleRate: publicEnv.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE,
  });
