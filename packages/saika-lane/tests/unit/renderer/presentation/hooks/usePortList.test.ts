// SPDX-License-Identifier: MIT
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { usePortList } from '@/renderer/presentation/hooks/usePortList';
import { connectionService } from '@/renderer/services/connectionService';

vi.mock('@/renderer/services/connectionService', () => ({
  connectionService: {
    listPorts: vi.fn(),
  },
}));

const mockListPorts = vi.mocked(connectionService.listPorts);

describe('usePortList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('clears stale port options when a refresh fails after a successful load', async () => {
    mockListPorts
      .mockResolvedValueOnce({
        ports: [{ path: '/dev/ttyUSB0', manufacturer: 'FTDI' }],
      })
      .mockRejectedValueOnce(new Error('USB scan failed'));

    const { result } = renderHook(() => usePortList());

    await waitFor(() => {
      expect(result.current.isLoadingPorts).toBe(false);
    });

    expect(result.current.ports).toEqual([{ path: '/dev/ttyUSB0', manufacturer: 'FTDI' }]);
    expect(result.current.portOptions).toEqual([{ value: '/dev/ttyUSB0', label: '/dev/ttyUSB0 (FTDI)' }]);

    act(() => {
      result.current.refreshPorts();
    });

    await waitFor(() => {
      expect(result.current.portError).toBe('USB scan failed');
    });

    expect(result.current.ports).toEqual([]);
    expect(result.current.portOptions).toEqual([]);
  });
});
