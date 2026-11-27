// SPDX-License-Identifier: MIT
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { usePrintStore } from '@/renderer/presentation/stores/printStore';
import { useSessionStore } from '@/renderer/presentation/stores/sessionStore';
import { reportService } from '@/renderer/services/reportService';

vi.mock('@/renderer/services/reportService', () => ({ reportService: { openPrintWindow: vi.fn() } }));

describe('printStore', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    usePrintStore.setState({ isPrinting: false, error: null });
    useSessionStore.getState().setSessionId('session-1');
  });
  it('prints the current session', async () => {
    await usePrintStore.getState().printCurrentSession();
    expect(reportService.openPrintWindow).toHaveBeenCalledExactlyOnceWith({ sessionId: 'session-1' });
  });
  it('does nothing without a session', async () => {
    useSessionStore.getState().setSessionId(null);
    await usePrintStore.getState().printCurrentSession();
    expect(reportService.openPrintWindow).not.toHaveBeenCalled();
  });
  it('coalesces button and keyboard requests while printing', async () => {
    let finish!: () => void;
    vi.mocked(reportService.openPrintWindow).mockReturnValue(
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    const first = usePrintStore.getState().printCurrentSession();
    await usePrintStore.getState().printCurrentSession();
    expect(reportService.openPrintWindow).toHaveBeenCalledTimes(1);
    expect(usePrintStore.getState().isPrinting).toBe(true);
    finish();
    await first;
    expect(usePrintStore.getState().isPrinting).toBe(false);
  });
  it('shows failures and permits retry without an unhandled rejection', async () => {
    vi.mocked(reportService.openPrintWindow)
      .mockRejectedValueOnce(new Error('Printer unavailable'))
      .mockResolvedValueOnce(undefined);
    await usePrintStore.getState().printCurrentSession();
    expect(usePrintStore.getState()).toMatchObject({ isPrinting: false, error: 'Printer unavailable' });
    await usePrintStore.getState().printCurrentSession();
    expect(usePrintStore.getState().error).toBeNull();
  });
});
