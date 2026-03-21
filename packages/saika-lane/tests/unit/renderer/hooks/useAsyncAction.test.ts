// SPDX-License-Identifier: MIT
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useAsyncAction } from '@/renderer/presentation/hooks/useAsyncAction';

describe('useAsyncAction', () => {
  it('initial state: loading=false, error=null', () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const { result } = renderHook(() => useAsyncAction(fn));

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('on success: loading transitions false→true→false and returns the result', async () => {
    const fn = vi.fn<() => Promise<string>>().mockResolvedValue('result');
    const { result } = renderHook(() => useAsyncAction(fn));

    let returnValue: string | undefined;
    await act(async () => {
      returnValue = await result.current.execute();
    });

    expect(returnValue).toBe('result');
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(fn).toHaveBeenCalledOnce();
  });

  it('passes arguments correctly', async () => {
    const fn = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useAsyncAction(fn));

    await act(async () => {
      await result.current.execute('a', 42);
    });

    expect(fn).toHaveBeenCalledWith('a', 42);
  });

  it('sets an Error instance error as-is', async () => {
    const error = new Error('service error');
    const fn = vi.fn().mockRejectedValue(error);
    const { result } = renderHook(() => useAsyncAction(fn));

    await act(async () => {
      await expect(result.current.execute()).rejects.toThrow('service error');
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe(error);
  });

  it('wraps a non-Error with the fallback message', async () => {
    const fn = vi.fn().mockRejectedValue('string error');
    const { result } = renderHook(() => useAsyncAction(fn, { errorMessage: 'Custom error' }));

    await act(async () => {
      await expect(result.current.execute()).rejects.toThrow('Custom error');
    });

    expect(result.current.error?.message).toBe('Custom error');
  });

  it('uses the default message when options are not specified for a non-Error', async () => {
    const fn = vi.fn().mockRejectedValue(42);
    const { result } = renderHook(() => useAsyncAction(fn));

    await act(async () => {
      await expect(result.current.execute()).rejects.toThrow('An error occurred');
    });

    expect(result.current.error?.message).toBe('An error occurred');
  });

  it('clears the previous error on re-execution', async () => {
    let callCount = 0;
    const fn = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) throw new Error('first');
      return 'ok';
    });

    const { result } = renderHook(() => useAsyncAction(fn));

    // 1st call: error
    await act(async () => {
      await expect(result.current.execute()).rejects.toThrow('first');
    });
    expect(result.current.error?.message).toBe('first');

    // 2nd call: success → error is cleared
    await act(async () => {
      await result.current.execute();
    });
    expect(result.current.error).toBeNull();
  });

  it('can manually clear the error with clearError', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('fail'));
    const { result } = renderHook(() => useAsyncAction(fn));

    await act(async () => {
      await expect(result.current.execute()).rejects.toThrow('fail');
    });
    expect(result.current.error).not.toBeNull();

    act(() => {
      result.current.clearError();
    });
    expect(result.current.error).toBeNull();
  });

  it('calls the latest function even when fn reference changes (ref pattern)', async () => {
    const fn1 = vi.fn<() => Promise<string>>().mockResolvedValue('v1');
    const fn2 = vi.fn<() => Promise<string>>().mockResolvedValue('v2');

    const { result, rerender } = renderHook(({ fn }) => useAsyncAction(fn), { initialProps: { fn: fn1 } });

    rerender({ fn: fn2 });

    let returnValue: string | undefined;
    await act(async () => {
      returnValue = await result.current.execute();
    });

    expect(fn1).not.toHaveBeenCalled();
    expect(fn2).toHaveBeenCalledOnce();
    expect(returnValue).toBe('v2');
  });

  it('execute reference is stable (useCallback)', () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const { result, rerender } = renderHook(() => useAsyncAction(fn));
    const firstExecute = result.current.execute;

    rerender();

    expect(result.current.execute).toBe(firstExecute);
  });

  it('loading returns to false after an error', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useAsyncAction(fn));

    await act(async () => {
      await expect(result.current.execute()).rejects.toThrow('boom');
    });

    expect(result.current.loading).toBe(false);
  });

  it('concurrent execution: loading stays true until both complete', async () => {
    let resolve1!: (v: string) => void;
    let resolve2!: (v: string) => void;
    const fn = vi
      .fn<() => Promise<string>>()
      .mockImplementationOnce(
        () =>
          new Promise<string>((r) => {
            resolve1 = r;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<string>((r) => {
            resolve2 = r;
          }),
      );

    const { result } = renderHook(() => useAsyncAction(fn));

    // Start two execute calls simultaneously
    let p1: Promise<string>;
    let p2: Promise<string>;
    act(() => {
      p1 = result.current.execute();
      p2 = result.current.execute();
    });
    expect(result.current.loading).toBe(true);

    // First completes → still loading
    await act(async () => {
      resolve1('a');
      await p1!;
    });
    expect(result.current.loading).toBe(true);

    // Second completes → loading false
    await act(async () => {
      resolve2('b');
      await p2!;
    });
    expect(result.current.loading).toBe(false);
  });

  it('concurrent execution: loading stays true even if one errors while the other is running', async () => {
    let reject1!: (e: Error) => void;
    let resolve2!: (v: string) => void;
    const fn = vi
      .fn<() => Promise<string>>()
      .mockImplementationOnce(
        () =>
          new Promise<string>((_, rej) => {
            reject1 = rej;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<string>((r) => {
            resolve2 = r;
          }),
      );

    const { result } = renderHook(() => useAsyncAction(fn));

    let p1: Promise<string>;
    let p2: Promise<string>;
    act(() => {
      p1 = result.current.execute();
      p2 = result.current.execute();
    });
    expect(result.current.loading).toBe(true);

    // First errors → still loading
    await act(async () => {
      reject1(new Error('fail'));
      await expect(p1!).rejects.toThrow('fail');
    });
    expect(result.current.loading).toBe(true);

    // Second completes → loading false
    await act(async () => {
      resolve2('ok');
      await p2!;
    });
    expect(result.current.loading).toBe(false);
  });
});
