// SPDX-License-Identifier: MIT
import type { OpenPrintWindowInput } from '@/main/composition/tokens';
import type { ICompetitionRepository } from '@/main/modules/competition/domain/ICompetitionRepository';
import type { PrintWindowService } from '@/main/modules/report/infra/PrintWindowService';
import type { ISessionRepository } from '@/main/modules/session/domain/ISessionRepository';
import type { CommandHandler } from '@/main/shared-infra/cqrs';
import { ErrorCatalog } from '@/shared/errors/ErrorCatalog';

/**
 * createOpenPrintWindowHandler (print window display handler factory)
 *
 * @param printWindowService - Print window service
 * @param sessionRepository - Session repository
 * @param competitionRepository - Competition repository
 * @returns CommandHandler
 */
export function createOpenPrintWindowHandler(
  printWindowService: PrintWindowService,
  sessionRepository: ISessionRepository,
  competitionRepository: ICompetitionRepository,
): CommandHandler<OpenPrintWindowInput> {
  return async (input) => {
    try {
      const activeCompetition = await competitionRepository.findActive();
      const activeSession = activeCompetition ? null : await sessionRepository.findActive();
      const sessionId = activeCompetition?.sessionId ?? activeSession?.id ?? input.sessionId;

      await printWindowService.open(sessionId);
    } catch (error) {
      throw ErrorCatalog.createError(
        'PRINT_WINDOW_CREATION_FAILED',
        undefined,
        error instanceof Error ? error : undefined,
      );
    }
  };
}
