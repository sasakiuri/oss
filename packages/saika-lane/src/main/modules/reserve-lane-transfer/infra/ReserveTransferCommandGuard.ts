// SPDX-License-Identifier: MIT
import type { CommandMiddleware } from '@/main/shared-infra/cqrs/CommandBus';

/** Preserve a staged or partially applied snapshot across local and remote commands. */
export class ReserveTransferCommandGuard implements CommandMiddleware {
  constructor(private readonly pending: () => boolean) {}
  async execute<R>(name: string, command: unknown, next: () => Promise<R>): Promise<R> {
    const contextual =
      typeof command === 'object' && command !== null && ('competitionId' in command || 'sessionId' in command);
    if ((contextual || name === 'StartCompetition') && this.pending())
      throw new Error('Complete or cancel the pending reserve transfer before changing competition state');
    return next();
  }
}
