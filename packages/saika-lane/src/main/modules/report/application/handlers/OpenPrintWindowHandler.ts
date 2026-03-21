// SPDX-License-Identifier: MIT
import type { OpenPrintWindowInput } from '@/main/composition/tokens';
import type { PrintWindowService } from '@/main/modules/report/infra/PrintWindowService';
import type { CommandHandler } from '@/main/shared-infra/cqrs';
import { ErrorCatalog } from '@/shared/errors/ErrorCatalog';

/**
 * createOpenPrintWindowHandler (print window display handler factory)
 *
 * @param printWindowService - Print window service
 * @returns CommandHandler
 */
export function createOpenPrintWindowHandler(
  printWindowService: PrintWindowService,
): CommandHandler<OpenPrintWindowInput> {
  return async (input) => {
    try {
      await printWindowService.open(input.sessionId);
    } catch (error) {
      throw ErrorCatalog.createError(
        'PRINT_WINDOW_CREATION_FAILED',
        undefined,
        error instanceof Error ? error : undefined,
      );
    }
  };
}
