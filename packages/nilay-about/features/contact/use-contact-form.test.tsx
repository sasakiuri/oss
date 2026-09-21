import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';

import { useContactForm } from './use-contact-form';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it('does not automatically resend a contact when the response is lost', async () => {
  vi.useFakeTimers();
  const fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
  vi.stubGlobal('fetch', fetch);
  const client = new QueryClient({ defaultOptions: { mutations: { retry: 1 } } });
  const { result, unmount } = renderHook(() => useContactForm(), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
  await act(async () => {
    await expect(
      result.current.mutateAsync({ title: 'Question', message: 'Message', requiresReply: false }),
    ).rejects.toThrow('Failed to fetch');
  });
  await act(() => vi.advanceTimersByTimeAsync(30_000));
  expect(fetch).toHaveBeenCalledTimes(1);
  unmount();
  client.clear();
});
