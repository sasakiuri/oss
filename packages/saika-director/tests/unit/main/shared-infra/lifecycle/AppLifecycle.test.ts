import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppLifecycle } from '@/main/shared-infra/lifecycle/AppLifecycle';

// Suppress Logger output in tests
vi.mock('@/shared/utils/Logger', () => ({
  Logger: {
    create: () => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      logError: vi.fn(),
    }),
  },
}));

vi.mock('electron', () => ({
  app: { isPackaged: false },
}));

function createMockService(name: string, opts?: { startFn?: () => Promise<void>; stopFn?: () => Promise<void> }) {
  return {
    name,
    start: opts?.startFn ?? vi.fn().mockResolvedValue(undefined),
    stop: opts?.stopFn ?? vi.fn().mockResolvedValue(undefined),
  };
}

describe('AppLifecycle', () => {
  let lifecycle: AppLifecycle;

  beforeEach(() => {
    lifecycle = new AppLifecycle();
  });

  describe('register', () => {
    it('should register a service', () => {
      expect(() => lifecycle.register(createMockService('svc1'))).not.toThrow();
    });

    it('should throw on duplicate service name', () => {
      lifecycle.register(createMockService('svc1'));
      expect(() => lifecycle.register(createMockService('svc1'))).toThrow(
        'AppLifecycle: duplicate service name: "svc1"',
      );
    });
  });

  describe('startAll', () => {
    it('should start services in registration order', async () => {
      const order: string[] = [];
      const svc1 = createMockService('svc1', {
        startFn: async () => {
          order.push('svc1');
        },
      });
      const svc2 = createMockService('svc2', {
        startFn: async () => {
          order.push('svc2');
        },
      });
      lifecycle.register(svc1);
      lifecycle.register(svc2);

      await lifecycle.startAll();
      expect(order).toEqual(['svc1', 'svc2']);
    });

    it('should fail-fast on service start failure', async () => {
      const svc1 = createMockService('svc1', {
        startFn: async () => {
          throw new Error('start failed');
        },
      });
      const svc2 = createMockService('svc2');
      lifecycle.register(svc1);
      lifecycle.register(svc2);

      await expect(lifecycle.startAll()).rejects.toThrow('start failed');
      expect(svc2.start).not.toHaveBeenCalled();
    });

    it('should rollback started services on failure', async () => {
      const order: string[] = [];
      const svc1 = createMockService('svc1', {
        startFn: async () => {
          order.push('start:svc1');
        },
        stopFn: async () => {
          order.push('stop:svc1');
        },
      });
      const svc2 = createMockService('svc2', {
        startFn: async () => {
          order.push('start:svc2');
        },
        stopFn: async () => {
          order.push('stop:svc2');
        },
      });
      const svc3 = createMockService('svc3', {
        startFn: async () => {
          throw new Error('svc3 failed');
        },
      });
      const svc4 = createMockService('svc4');
      lifecycle.register(svc1);
      lifecycle.register(svc2);
      lifecycle.register(svc3);
      lifecycle.register(svc4);

      await expect(lifecycle.startAll()).rejects.toThrow('svc3 failed');
      // svc1 and svc2 started, svc3 failed, svc4 never started
      // Rollback: svc2 stopped first, then svc1 (reverse order)
      expect(order).toEqual(['start:svc1', 'start:svc2', 'stop:svc2', 'stop:svc1']);
      expect(svc4.start).not.toHaveBeenCalled();
    });

    it('should continue rollback even if a stop fails during rollback', async () => {
      const svc1 = createMockService('svc1');
      const svc2 = createMockService('svc2', {
        stopFn: async () => {
          throw new Error('stop failed');
        },
      });
      const svc3 = createMockService('svc3', {
        startFn: async () => {
          throw new Error('start failed');
        },
      });
      lifecycle.register(svc1);
      lifecycle.register(svc2);
      lifecycle.register(svc3);

      await expect(lifecycle.startAll()).rejects.toThrow('start failed');
      // svc2.stop fails but svc1.stop should still be called
      expect(svc1.stop).toHaveBeenCalled();
    });
  });

  describe('stopAll', () => {
    it('should stop services in reverse order', async () => {
      const order: string[] = [];
      const svc1 = createMockService('svc1', {
        stopFn: async () => {
          order.push('svc1');
        },
      });
      const svc2 = createMockService('svc2', {
        stopFn: async () => {
          order.push('svc2');
        },
      });
      lifecycle.register(svc1);
      lifecycle.register(svc2);

      await lifecycle.stopAll();
      expect(order).toEqual(['svc2', 'svc1']);
    });

    it('should continue stopping when a service fails', async () => {
      const svc1 = createMockService('svc1');
      const svc2 = createMockService('svc2', {
        stopFn: async () => {
          throw new Error('stop failed');
        },
      });
      const svc3 = createMockService('svc3');
      lifecycle.register(svc1);
      lifecycle.register(svc2);
      lifecycle.register(svc3);

      await lifecycle.stopAll(); // should not throw
      expect(svc1.stop).toHaveBeenCalled();
    });
  });
});
