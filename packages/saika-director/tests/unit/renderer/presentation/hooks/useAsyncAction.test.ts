import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useAsyncAction } from '@/renderer/presentation/hooks/useAsyncAction';

describe('useAsyncAction', () => {
  it('is busy while the work runs and resolves true when it completes', async () => {
    const { result } = renderHook(() => useAsyncAction());
    let finish!: () => void;
    let completed: Promise<boolean>;

    act(() => {
      completed = result.current.run(() => new Promise<void>((resolve) => (finish = resolve)));
    });
    expect(result.current.busy).toBe(true);

    await act(async () => {
      finish();
      await expect(completed).resolves.toBe(true);
    });
    expect(result.current.busy).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('shows the message of a thrown error and resolves false', async () => {
    const { result } = renderHook(() => useAsyncAction());

    await act(async () => {
      await expect(
        result.current.run(async () => {
          throw new Error('Lane offline');
        }, 'Fallback'),
      ).resolves.toBe(false);
    });

    expect(result.current.error).toBe('Lane offline');
    expect(result.current.busy).toBe(false);
  });

  it('uses the fallback or the text of a thrown non-Error value', async () => {
    const { result } = renderHook(() => useAsyncAction());

    await act(async () => {
      await result.current.run(() => Promise.reject('raw'), 'Transfer failed');
    });
    expect(result.current.error).toBe('Transfer failed');

    await act(async () => {
      await result.current.run(() => Promise.reject('raw'));
    });
    expect(result.current.error).toBe('raw');
  });

  it('clears the previous error when the next action starts', async () => {
    const { result } = renderHook(() => useAsyncAction());
    act(() => result.current.setError('Validation failed'));

    await act(async () => {
      await result.current.run(async () => {});
    });

    expect(result.current.error).toBeNull();
  });

  it('keeps run stable across renders', () => {
    const { result, rerender } = renderHook(() => useAsyncAction());
    const first = result.current.run;
    rerender();
    expect(result.current.run).toBe(first);
  });
});
