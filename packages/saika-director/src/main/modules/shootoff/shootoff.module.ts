import { defineModule } from '@/main/shared-infra/module/ModuleDefinition';
import { shootoffContract } from '@/shared/ipc/contracts';

// Domain
import { InMemoryShootoffRepository } from './infra/InMemoryShootoffRepository';
import { ShootoffCommandHandler } from './application/commands/ShootoffCommandHandler';

// Tokens
import {
  StartShootoffToken,
  AddShootoffShotToken,
  CompleteShootoffRoundToken,
  ResolveShootoffToken,
  GetActiveShootoffToken,
} from './application/tokens';

export const shootoffModule = defineModule({
  name: 'shootoff',
  deps: ['eventBus', 'commandBus', 'queryBus', 'ipcRouter'],
  register(ctx) {
    const { eventBus, commandBus, queryBus, ipcRouter } = ctx;

    // === Repository ===
    const shootoffRepository = new InMemoryShootoffRepository();

    // === Command Handler (singleton) ===
    const shootoffCommandHandler = new ShootoffCommandHandler(shootoffRepository, commandBus, queryBus, eventBus);

    // === Register commands on CommandBus ===
    commandBus.register(StartShootoffToken, (cmd) => shootoffCommandHandler.executeStartShootoff(cmd));
    commandBus.register(AddShootoffShotToken, (cmd) => shootoffCommandHandler.executeAddShootoffShot(cmd));
    commandBus.register(CompleteShootoffRoundToken, (cmd) => shootoffCommandHandler.executeCompleteShootoffRound(cmd));
    commandBus.register(ResolveShootoffToken, (cmd) => shootoffCommandHandler.executeResolveShootoff(cmd));

    // === Query Handlers ===
    queryBus.register(GetActiveShootoffToken, async (query) => {
      const active = shootoffRepository.findActiveByEventId(query.eventId);
      if (!active) return null;
      return {
        shootoffId: active.id.value,
        contestedRank: active.contestedRank,
        currentRound: active.currentRoundNumber,
        isResolved: active.isResolved,
        participantIds: active.targetParticipantIds.map((pid) => pid.value),
      };
    });

    // === IPC Registration ===
    ipcRouter.register(shootoffContract, {
      start: (input) => commandBus.execute(StartShootoffToken, input),
      addShot: (input) => commandBus.execute(AddShootoffShotToken, input),
      completeRound: (input) => commandBus.execute(CompleteShootoffRoundToken, input),
      resolve: (input) => commandBus.execute(ResolveShootoffToken, input),
      getActive: (input) => queryBus.execute(GetActiveShootoffToken, input),
    });
  },
});
