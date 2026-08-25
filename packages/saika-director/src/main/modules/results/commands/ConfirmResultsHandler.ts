import type { IResultRepository } from '../domain/IResultRepository';
import type { ConfirmResultsCommand } from './ConfirmResults';
import type { ConfirmResultsResponse } from '@/shared/ipc/contracts/results.contract';
import { DomainError, ErrorCatalog } from '@/shared/errors';
import { Logger } from '@/shared/utils/Logger';

export type { ConfirmResultsResponse };

const logger = Logger.create('ConfirmResultsHandler');

export class ConfirmResultsHandler {
  constructor(private readonly resultRepository: IResultRepository) {}

  execute(command: ConfirmResultsCommand): ConfirmResultsResponse {
    const endTimer = logger.startTimer('ConfirmResults');
    logger.info('ConfirmResults executed', { eventId: command.eventId, resultIds: command.resultIds });
    logger.debug('Starting with command:', JSON.stringify(command));

    try {
      if (command.resultIds.length === 0) {
        logger.debug('No result IDs provided');
        return { confirmedCount: 0 };
      }

      for (const resultId of command.resultIds) {
        const result = this.resultRepository.findById(resultId);
        if (!result) {
          throw new DomainError(ErrorCatalog.DATA.NOT_FOUND, {
            messageOverride: `Result ${resultId} not found`,
          });
        }
        if (result.eventId.value !== command.eventId) {
          throw new DomainError(ErrorCatalog.DATA.CORRUPTED, {
            messageOverride: `Result ${resultId} does not belong to event ${command.eventId}`,
          });
        }
      }

      this.resultRepository.updateStatus(command.resultIds, 'confirmed');

      logger.info(`Confirmed ${command.resultIds.length} results`);

      return { confirmedCount: command.resultIds.length };
    } finally {
      endTimer();
    }
  }
}
