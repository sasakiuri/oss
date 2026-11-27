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

  describe('selectDevice', () => {
    const mt201: TargetDeviceDto = {
      id: 'MT201',
      manufacturer: 'KOHTO',
      displayName: 'MT201',
      baudRate: 9600,
      supportedDisciplines: ['AIR_RIFLE_10M'],
    };
    const unsupported: TargetDeviceDto = { ...mt201, id: 'CUSTOM1', supportedDisciplines: [] };

    async function listed(devices: TargetDeviceDto[]) {
      vi.mocked(connectionService.getDevicesByManufacturer).mockResolvedValue({ devices });
      const { result } = renderHook(() => useDeviceList('KOHTO'));
      await act(() => result.current.fetchDevices('KOHTO'));
      return result;
    }

    it('selects the device and its first discipline when the current one is not supported', async () => {
      const result = await listed([mt201, unsupported]);
      useSessionStore.getState().setDiscipline('BEAM_PISTOL_10M');

      act(() => result.current.selectDevice('MT201'));

      expect(result.current.selectedDeviceId).toBe('MT201');
      expect(useSessionStore.getState().discipline).toBe('AIR_RIFLE_10M');
    });

    it.each(['RIFLE_300M', 'PISTOL_50M'] as const)('preserves %s when choosing Custom input', async (discipline) => {
      const result = await listed([custom, mt201]);
      useSessionStore.getState().setDiscipline(discipline);

      act(() => result.current.selectDevice('CUSTOM'));

      expect(result.current.selectedDeviceId).toBe('CUSTOM');
      expect(useSessionStore.getState().discipline).toBe(discipline);
    });

    it('keeps the discipline for a device without supported disciplines', async () => {
      const result = await listed([mt201, unsupported]);

      act(() => result.current.selectDevice('CUSTOM1'));

      expect(result.current.selectedDeviceId).toBe('CUSTOM1');
      expect(useSessionStore.getState().discipline).toBeNull();
    });
  });
});
