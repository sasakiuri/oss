// SPDX-License-Identifier: MIT
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useDeviceList } from '@/renderer/presentation/hooks/useDeviceList';
import { useSessionStore } from '@/renderer/presentation/stores/sessionStore';
import { connectionService } from '@/renderer/services/connectionService';
import type { TargetDeviceDto } from '@/shared/ipc/contracts';

vi.mock('@/renderer/services/connectionService', () => ({ connectionService: { getDevicesByManufacturer: vi.fn() } }));
const custom: TargetDeviceDto = {
  id: 'CUSTOM',
  manufacturer: 'CUSTOM',
  displayName: 'Custom',
  baudRate: 9600,
  supportedDisciplines: ['AIR_RIFLE_10M', 'RIFLE_300M', 'PISTOL_50M'],
};

describe('useDeviceList', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    useSessionStore.getState().resetSession();
  });

  it.each(['RIFLE_300M', 'PISTOL_50M'] as const)(
    'preserves %s when automatically selecting the only available device',
    async (discipline) => {
      useSessionStore.getState().setDiscipline(discipline);
      vi.mocked(connectionService.getDevicesByManufacturer).mockResolvedValue({ devices: [custom] });
      const { result } = renderHook(() => useDeviceList('CUSTOM'));
      await act(() => result.current.fetchDevices('CUSTOM'));
      expect(result.current.selectedDeviceId).toBe('CUSTOM');
      expect(useSessionStore.getState().discipline).toBe(discipline);
    },
  );

  it('selects a supported discipline when the current discipline is incompatible', async () => {
    useSessionStore.getState().setDiscipline('RIFLE_300M');
    vi.mocked(connectionService.getDevicesByManufacturer).mockResolvedValue({
      devices: [
        {
          id: 'MT201',
          manufacturer: 'KOHTO',
          displayName: 'MT201',
          baudRate: 9600,
          supportedDisciplines: ['BEAM_RIFLE_10M'],
        },
      ],
    });
    const { result } = renderHook(() => useDeviceList('KOHTO'));
    await act(() => result.current.fetchDevices('KOHTO'));
    expect(useSessionStore.getState().discipline).toBe('BEAM_RIFLE_10M');
  });

  it('clears a saved device selection when its connection is no longer available', async () => {
    vi.mocked(connectionService.getDevicesByManufacturer)
      .mockResolvedValueOnce({ devices: [custom] })
      .mockResolvedValue({ devices: [] });
    const { result } = renderHook(() => useDeviceList('CUSTOM'));
    await act(() => result.current.fetchDevices('CUSTOM'));
    expect(result.current.selectedDeviceId).toBe('CUSTOM');
    await act(() => result.current.fetchDevices('CUSTOM', undefined, true));
    expect(result.current.selectedDeviceId).toBe('');
    expect(result.current.deviceOptions).toEqual([]);
  });
});
