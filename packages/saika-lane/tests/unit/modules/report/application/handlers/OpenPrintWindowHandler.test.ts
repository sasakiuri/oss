// SPDX-License-Identifier: MIT
import { describe, expect, it, vi } from 'vitest';

import { CompetitionState } from '@/main/modules/competition/domain/CompetitionState';
import { BR60S } from '@/main/modules/competition/domain/competitionTypes';
import { createOpenPrintWindowHandler } from '@/main/modules/report/application/handlers/OpenPrintWindowHandler';
import type { PrintWindowService } from '@/main/modules/report/infra/PrintWindowService';
import { DomainError } from '@/shared/errors/DomainError';

import { buildSession } from '../../../../../helpers/factories';
import { createMockCompetitionRepository, createMockSessionRepository } from '../../../../../helpers/mockDependencies';

function createMockPrintWindowService(): PrintWindowService {
  return {
    open: vi.fn().mockResolvedValue(undefined),
  } as unknown as PrintWindowService;
}

describe('createOpenPrintWindowHandler', () => {
  const createHandler = (service: PrintWindowService) =>
    createOpenPrintWindowHandler(service, createMockSessionRepository(), createMockCompetitionRepository());

  it('should call printWindowService.open() with sessionId', async () => {
    const service = createMockPrintWindowService();
    const handler = createHandler(service);

    await handler({ sessionId: 'session-001' });

    expect(service.open).toHaveBeenCalledWith('session-001');
  });

  it('should prefer active competition sessionId over input sessionId', async () => {
    const service = createMockPrintWindowService();
    const sessionRepository = createMockSessionRepository();
    const competitionRepository = createMockCompetitionRepository();
    const activeCompetition = CompetitionState.create('competition-001', 'competition-session', BR60S.config);
    vi.mocked(competitionRepository.findActive).mockResolvedValue(activeCompetition);
    const handler = createOpenPrintWindowHandler(service, sessionRepository, competitionRepository);

    await handler({ sessionId: 'stale-renderer-session' });

    expect(service.open).toHaveBeenCalledWith('competition-session');
    expect(sessionRepository.findActive).not.toHaveBeenCalled();
  });

  it('should prefer active session over input sessionId when no competition exists', async () => {
    const service = createMockPrintWindowService();
    const sessionRepository = createMockSessionRepository();
    const competitionRepository = createMockCompetitionRepository();
    const activeSession = buildSession();
    vi.mocked(competitionRepository.findActive).mockResolvedValue(null);
    vi.mocked(sessionRepository.findActive).mockResolvedValue(activeSession);
    const handler = createOpenPrintWindowHandler(service, sessionRepository, competitionRepository);

    await handler({ sessionId: 'stale-renderer-session' });

    expect(service.open).toHaveBeenCalledWith(activeSession.id);
  });

  it('should return void on successful open()', async () => {
    const service = createMockPrintWindowService();
    const handler = createHandler(service);

    await expect(handler({ sessionId: 'session-001' })).resolves.toBeUndefined();
  });

  it('should throw PRINT_WINDOW_CREATION_FAILED error on open() failure', async () => {
    const service = createMockPrintWindowService();
    const originalError = new Error('BrowserWindow creation failed');
    vi.mocked(service.open).mockRejectedValue(originalError);
    const handler = createHandler(service);

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
    const handler = createHandler(service);

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
