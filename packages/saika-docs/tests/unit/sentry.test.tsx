// SPDX-License-Identifier: MIT
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import GlobalError from '@/app/global-error';

const sentry = vi.hoisted(() => ({ init: vi.fn(), captureException: vi.fn(), captureRequestError: vi.fn() }));
vi.mock('@sentry/nextjs', () => sentry);

const dsn = 'https://public@o0.ingest.sentry.io/1';
beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('global error page', () => {
  it('reports the error only when Sentry is configured and lets the reader reload', async () => {
    const user = userEvent.setup();
    const reset = vi.fn();
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', '');
    render(<GlobalError error={new Error('unreported')} reset={reset} />).unmount();

    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', dsn);
    const error = new Error('reported');
    render(<GlobalError error={error} reset={reset} />);
    expect(screen.getByRole('heading', { name: '画面を表示できませんでした' })).toBeInTheDocument();
    // The import that reports the first error would have resolved before this one.
    await waitFor(() => expect(sentry.captureException).toHaveBeenCalled());
    expect(sentry.captureException.mock.calls).toEqual([[error]]);
    await user.click(screen.getByRole('button', { name: '再読み込み' }));
    expect(reset).toHaveBeenCalledOnce();
  });
});

describe('server instrumentation', () => {
  async function register(runtime: string | undefined) {
    vi.stubEnv('NEXT_RUNTIME', runtime);
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', dsn);
    vi.stubEnv('NEXT_PUBLIC_APP_ENV', 'production');
    // The server configuration reads the environment once when it is first imported.
    vi.resetModules();
    const instrumentation = await import('@/instrumentation');
    await instrumentation.register();
    return instrumentation;
  }

  it.each(['nodejs', 'edge'])('initializes Sentry with the server configuration in the %s runtime', async (runtime) => {
    await register(runtime);
    expect(sentry.init).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ dsn, environment: 'production', sendDefaultPii: false }),
    );
  });

  it('leaves Sentry alone outside the server runtimes and reports request errors through Sentry', async () => {
    const instrumentation = await register(undefined);
    expect(sentry.init).not.toHaveBeenCalled();
    expect(instrumentation.onRequestError).toBe(sentry.captureRequestError);
  });
});
