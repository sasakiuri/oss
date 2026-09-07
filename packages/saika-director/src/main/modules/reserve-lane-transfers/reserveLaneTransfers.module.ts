// SPDX-License-Identifier: MIT
import type { ModuleDefinition } from '@/main/shared-infra/module/ModuleDefinition';
import { reserveLaneTransfersContract } from '@/shared/ipc/contracts';

import {
  ReserveLaneTransferService,
  ResumeReserveLaneToken,
  ResumeReserveMatchToken,
  TransferReserveLaneToken,
} from './ReserveLaneTransferService';
import { SqliteReserveTransferRepository } from './SqliteReserveTransferRepository';

export const reserveLaneTransfersModule: ModuleDefinition<'ipcRouter' | 'database' | 'commandBus'> = {
  name: 'reserveLaneTransfers',
  deps: ['ipcRouter', 'database', 'commandBus'],
  register({ ipcRouter, database, commandBus }) {
    const service = new ReserveLaneTransferService(new SqliteReserveTransferRepository(database), {
      transfer: (input) => commandBus.execute(TransferReserveLaneToken, input),
      resume: (input) => commandBus.execute(ResumeReserveLaneToken, input),
      resumeMatch: (input) => commandBus.execute(ResumeReserveMatchToken, input),
    });
    ipcRouter.register(reserveLaneTransfersContract, {
      workspace: async (input) => service.workspace(input.competitionId),
      prepare: (input) => service.prepare(input),
      cancel: (input) => service.cancel(input),
      complete: (input) => service.complete(input),
      resume: (input) => service.resume(input),
      resumeMatch: (input) => service.resumeMatch(input.id),
    });
    return {};
  },
};
