// SPDX-License-Identifier: MIT
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { InferHandlers } from '@sasakiuri/saika-ipc';
import { vistaContract } from '@/shared/ipc/contracts';
const { createHost, loadCredentials, sourceCatalog, sourceSnapshot } = vi.hoisted(() => ({
  createHost: vi.fn(),
  loadCredentials: vi.fn(),
  sourceCatalog: vi.fn(),
  sourceSnapshot: vi.fn(),
}));
vi.mock('electron', () => ({ app: { getPath: () => '/unused' } }));
vi.mock('@sasakiuri/saika-protocol/vista-node', () => ({
  loadVistaCredentials: loadCredentials,
  createVistaHost: createHost,
}));
vi.mock('@/main/modules/vista/application/DirectorVistaSource', () => ({
  DirectorVistaSource: class {
    catalog = sourceCatalog;
    snapshot = sourceSnapshot;
  },
}));
import { vistaModule } from '@/main/modules/vista';
describe('Vista failure isolation', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    loadCredentials.mockImplementation(() => {
      throw new Error('Invalid credential file');
    });
  });
  it('keeps Director composition available when optional source credentials are corrupt', async () => {
    let handlers: InferHandlers<typeof vistaContract> | undefined;
    const register = vi.fn((_, registered: InferHandlers<typeof vistaContract>) => {
      handlers = registered;
    });
    const context = {
      ipcRouter: { register },
      appConfigService: { get: (key: string) => (key === 'vista.enabled' ? false : 45832), setMany: vi.fn() },
    } as unknown as Parameters<typeof vistaModule.register>[0];
    expect(() => vistaModule.register(context)).not.toThrow();
    const settings = await handlers!.getSettings();
    expect(settings).toMatchObject({ running: false, error: expect.stringContaining('Invalid credential file') });
    await expect(handlers!.setSettings({ enabled: true, port: 45832 })).rejects.toThrow(
      'Vista credentials are unavailable',
    );
    expect(createHost).not.toHaveBeenCalled();
  });

  it.each([false, true])('closes a new listener if saving settings fails (previous sharing=%s)', async (enabled) => {
    loadCredentials.mockReturnValue({ sourceId: 'director', secret: 'a'.repeat(43) });
    const activePorts = new Set<number>();
    createHost.mockImplementation(async ({ port }: { port: number }) => {
      if (activePorts.has(port)) throw new Error('Port is already listening');
      activePorts.add(port);
      return {
        port,
        endpoints: [`http://127.0.0.1:${port}`],
        close: async () => {
          activePorts.delete(port);
        },
      };
    });
    const saved: Record<string, boolean | number> = { 'vista.enabled': enabled, 'vista.port': 45832 };
    let failSave = true;
    let handlers: InferHandlers<typeof vistaContract> | undefined;
    const context = {
      ipcRouter: {
        register: (_: unknown, registered: InferHandlers<typeof vistaContract>) => {
          handlers = registered;
        },
      },
      eventBus: { on: () => () => undefined },
      appConfigService: {
        get: (key: string) => saved[key],
        setMany: (values: Record<string, boolean | number>) => {
          if (failSave) throw new Error('SQLITE_FULL');
          Object.assign(saved, values);
        },
      },
    } as unknown as Parameters<typeof vistaModule.register>[0];
    const contribution = await vistaModule.register(context);
    const lifecycle = contribution!.lifecycle![0]!;
    await lifecycle.start?.();
    try {
      await expect(handlers!.setSettings({ enabled: true, port: 45833 })).rejects.toThrow('SQLITE_FULL');
      expect([...activePorts]).toEqual(enabled ? [45832] : []);
      expect(await handlers!.getSettings()).toMatchObject({
        enabled,
        running: enabled,
        port: 45832,
        error: 'SQLITE_FULL',
      });

      failSave = false;
      await handlers!.setSettings({ enabled: false, port: 45832 });
      expect(await handlers!.getSettings()).toMatchObject({ enabled: false, running: false, error: null });
      expect([...activePorts]).toEqual([]);
    } finally {
      await lifecycle.stop?.();
    }
    expect([...activePorts]).toEqual([]);
  });
});

describe('Vista read endpoints', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    loadCredentials.mockReturnValue({ sourceId: 'director', secret: 'a'.repeat(43) });
    createHost.mockImplementation(async ({ port }: { port: number }) => ({
      port,
      endpoints: [`http://127.0.0.1:${port}`],
      close: async () => undefined,
    }));
  });

  it('serves the catalog and decoded snapshot subjects to GET requests only', async () => {
    const context = {
      ipcRouter: { register: vi.fn() },
      eventBus: { on: () => () => undefined },
      appConfigService: { get: (key: string) => (key === 'vista.enabled' ? true : 45832), setMany: vi.fn() },
    } as unknown as Parameters<typeof vistaModule.register>[0];
    const lifecycle = vistaModule.register(context)!.lifecycle![0]!;
    await lifecycle.start();
    try {
      const { handle, identity } = createHost.mock.calls[0]![0] as {
        handle: (method: string, path: string) => unknown;
        identity: Record<string, unknown>;
      };
      expect(identity).toMatchObject({ protocolVersion: 1, sourceId: 'director', kind: 'director' });
      sourceCatalog.mockReturnValue('catalog');
      sourceSnapshot.mockReturnValue('snapshot');

      expect(handle('GET', '/vista/v1/catalog')).toBe('catalog');
      expect(handle('GET', '/vista/v1/snapshot/competition%3A1%3Arelay')).toBe('snapshot');
      expect(sourceSnapshot).toHaveBeenCalledExactlyOnceWith('competition:1:relay');
      expect(() => handle('POST', '/vista/v1/catalog')).toThrow(new Error('Vista source accepts read requests only'));
      expect(() => handle('GET', '/vista/v1/snapshot/a/b')).toThrow(new Error('Unknown Vista read endpoint'));
      expect(() => handle('GET', '/vista/v1/other')).toThrow(new Error('Unknown Vista read endpoint'));
    } finally {
      await lifecycle.stop();
    }
  });
});
