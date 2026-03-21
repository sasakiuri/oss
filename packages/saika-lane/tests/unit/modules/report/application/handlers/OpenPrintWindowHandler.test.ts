// SPDX-License-Identifier: MIT
import { describe, expect, it, vi } from 'vitest';

import { createOpenPrintWindowHandler } from '@/main/modules/report/application/handlers/OpenPrintWindowHandler';
import type { PrintWindowService } from '@/main/modules/report/infra/PrintWindowService';
import { DomainError } from '@/shared/errors/DomainError';

function createMockPrintWindowService(): PrintWindowService {
  return {
    open: vi.fn().mockResolvedValue(undefined),
  } as unknown as PrintWindowService;
}

describe('createOpenPrintWindowHandler', () => {
  it('should call printWindowService.open() with sessionId', async () => {
    const service = createMockPrintWindowService();
    const handler = createOpenPrintWindowHandler(service);

    await handler({ sessionId: 'session-001' });

    expect(service.open).toHaveBeenCalledWith('session-001');
  });

  it('should return void on successful open()', async () => {
    const service = createMockPrintWindowService();
    const handler = createOpenPrintWindowHandler(service);

    await expect(handler({ sessionId: 'session-001' })).resolves.toBeUndefined();
  });

  it('should throw PRINT_WINDOW_CREATION_FAILED error on open() failure', async () => {
    const service = createMockPrintWindowService();
    const originalError = new Error('BrowserWindow creation failed');
    vi.mocked(service.open).mockRejectedValue(originalError);
    const handler = createOpenPrintWindowHandler(service);

    try {
      await handler({ sessionId: 'session-001' });
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(DomainError);
      expect((error as DomainError).code).toBe('PRINT_WINDOW_CREATION_FAILED');
      expect((error as DomainError).cause).toBe(originalError);
    }
  });

  it('should throw PRINT_WINDOW_CREATION_FAILED even for non-Error exceptions', async () => {
    const service = createMockPrintWindowService();
    vi.mocked(service.open).mockRejectedValue('unknown');
    const handler = createOpenPrintWindowHandler(service);

    try {
      await handler({ sessionId: 'session-001' });
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(DomainError);
      expect((error as DomainError).code).toBe('PRINT_WINDOW_CREATION_FAILED');
      // cause is undefined when the thrown value is not an Error
      expect((error as DomainError).cause).toBeUndefined();
    }
  });
});
