// SPDX-License-Identifier: MIT
import { join } from 'node:path';

import { vi } from 'vitest';

import type { LaneApplicationPaths } from '@/main/composition/createLaneServices';
import type { IUSBConnectionManager } from '@/main/modules/connection/infra/usb/IUSBConnectionManager';
import type { ActiveRunStartup } from '@/main/startup/restoreActiveRun';

/** Keep main/window orchestration real without importing unrelated service owners and feature modules. */
export function mockMainServiceConstruction(): void {
  vi.doMock('@/main/composition/modules', () => ({ laneModules: [] }));
  vi.doMock('@/main/composition/createLaneServices', async () => {
    const [
      { AppSettingsStore },
      { LocalStorageAdapter },
      { CommandBus },
      { TypedEventBus },
      { IpcRouter },
      { USBConnectionManager },
      { ActiveRunStartup },
    ] = await Promise.all([
      import('@/main/modules/settings/infra/AppSettingsStore'),
      import('@/main/modules/settings/infra/LocalStorageAdapter'),
      import('@/main/shared-infra/cqrs'),
      import('@/main/shared-infra/events/TypedEventBus'),
      import('@/main/shared-infra/ipc/IpcRouter'),
      vi.importMock<{ USBConnectionManager: new () => Pick<IUSBConnectionManager, 'listPorts'> }>(
        '@/main/modules/connection/infra/usb/USBConnectionManager',
      ),
      vi.importMock<{ ActiveRunStartup: new () => Pick<ActiveRunStartup, 'afterReady' | 'restore' | 'snapshot'> }>(
        '@/main/startup/restoreActiveRun',
      ),
    ]);
    return {
      createLaneServices(_window: unknown, { userDataPath }: LaneApplicationPaths) {
        // Settings-file and legacy-storage recovery remain exercised by the original fixtures.
        const storage = new LocalStorageAdapter({ name: 'saika-lane' });
        const settingsStore = new AppSettingsStore({ filePath: join(userDataPath, 'settings.json'), storage });
        settingsStore.getAll();
        return {
          registry: {
            settingsStore,
            storage,
            commandBus: new CommandBus(),
            eventBus: new TypedEventBus(),
            ipcRouter: new IpcRouter(),
            usbManager: new USBConnectionManager(),
            startup: new ActiveRunStartup(),
            timedTargetControl: { getState: vi.fn(), cancel: vi.fn(), dispose: vi.fn() },
          },
        };
      },
    };
  });
}
