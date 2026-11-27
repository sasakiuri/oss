// SPDX-License-Identifier: MIT
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useBusyAction } from '@/renderer/presentation/hooks/useBusyAction';

describe('useBusyAction', () => {
  it('is busy while the work runs and clears an earlier error', async () => {
    const { result } = renderHook(() => useBusyAction());
    act(() => result.current.setError('Earlier failure'));
    let finish!: () => void;

    let running!: Promise<void>;
    act(() => {
      running = result.current.run(() => new Promise<void>((resolve) => (finish = resolve)));
    });
    expect(result.current).toMatchObject({ busy: true, error: null });

    await act(async () => {
      finish();
      await running;
    });
    expect(result.current).toMatchObject({ busy: false, error: null });
  });

  it('keeps the message of a failure instead of rejecting', async () => {
    const { result } = renderHook(() => useBusyAction());

    await act(async () => {
      await expect(result.current.run(() => Promise.reject(new Error('Save failed')))).resolves.toBeUndefined();
    });

    expect(result.current).toMatchObject({ busy: false, error: 'Save failed' });
  });
});
