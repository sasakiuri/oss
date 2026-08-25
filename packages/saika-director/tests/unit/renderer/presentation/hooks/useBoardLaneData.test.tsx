import type { PropsWithChildren } from 'react';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { EventBusProvider } from '@/renderer/events/EventBusProvider';
import { TestEventBus } from '@/renderer/events/TestEventBus';
import { useBoardLaneData } from '@/renderer/presentation/hooks/useBoardLaneData';

vi.mock('@/shared/utils/Logger', () => ({
  Logger: {
    create: () => ({ error: vi.fn() }),
  },
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe('useBoardLaneData', () => {
  it('does not let an older request overwrite newer board data', async () => {
    const older = deferred<Array<{ id: string }>>();
    const newer = deferred<Array<{ id: string }>>();
    const loadFn = vi.fn().mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
    const bus = new TestEventBus();
    const wrapper = ({ children }: PropsWithChildren) => <EventBusProvider bus={bus}>{children}</EventBusProvider>;
    const { result } = renderHook(() => useBoardLaneData({ loadFn }), { wrapper });

    expect(loadFn).toHaveBeenCalledOnce();
    act(() => {
      result.current.refetch();
    });
    expect(loadFn).toHaveBeenCalledTimes(2);

    await act(async () => {
      newer.resolve([{ id: 'newer' }]);
      await newer.promise;
    });
    expect(result.current.data).toEqual([{ id: 'newer' }]);

    await act(async () => {
      older.resolve([{ id: 'older' }]);
      await older.promise;
    });
    expect(result.current.data).toEqual([{ id: 'newer' }]);
  });
});
