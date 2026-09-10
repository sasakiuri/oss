// SPDX-License-Identifier: MIT
import { publicEnv } from './shared/config/env';

let sdk: typeof import('@sentry/nextjs') | undefined;
if (process.env.NEXT_PUBLIC_SENTRY_DSN)
  void import('@sentry/nextjs').then((Sentry) => {
    sdk = Sentry;
    Sentry.init({
      dsn: publicEnv.NEXT_PUBLIC_SENTRY_DSN,
      environment: publicEnv.NEXT_PUBLIC_APP_ENV,
      release: publicEnv.NEXT_PUBLIC_RELEASE,
      sendDefaultPii: false,
      tracesSampleRate: publicEnv.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE,
      replaysSessionSampleRate: publicEnv.NEXT_PUBLIC_SENTRY_REPLAY_SAMPLE_RATE,
      replaysOnErrorSampleRate: publicEnv.NEXT_PUBLIC_SENTRY_REPLAY_ERROR_SAMPLE_RATE,
      integrations: [
        Sentry.browserTracingIntegration(),
        ...(publicEnv.NEXT_PUBLIC_SENTRY_REPLAY_SAMPLE_RATE || publicEnv.NEXT_PUBLIC_SENTRY_REPLAY_ERROR_SAMPLE_RATE
          ? [Sentry.replayIntegration({ maskAllText: true, blockAllMedia: true })]
          : []),
      ],
    });
  });
export function onRouterTransitionStart(
  ...args: Parameters<typeof import('@sentry/nextjs').captureRouterTransitionStart>
) {
  sdk?.captureRouterTransitionStart(...args);
}
