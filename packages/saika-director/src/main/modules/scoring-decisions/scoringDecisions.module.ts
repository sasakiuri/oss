import type { ModuleDefinition } from '@/main/shared-infra/module/ModuleDefinition';
import { scoringDecisionsContract } from '@/shared/ipc/contracts';
import { AppendScoringDecisionHandler } from './application/AppendScoringDecisionHandler';
import { RevokeScoringDecisionHandler } from './application/RevokeScoringDecisionHandler';
import { toScoringDecisionDtos } from './application/toScoringDecisionDto';
import { AppendScoringDecisionToken, RevokeScoringDecisionToken } from './tokens';

export const scoringDecisionsModule: ModuleDefinition<
  'commandBus' | 'ipcRouter' | 'scoringDecisionRepository' | 'scoringDecisionTargetResolver'
> = {
  name: 'scoringDecisions',
  deps: ['commandBus', 'ipcRouter', 'scoringDecisionRepository', 'scoringDecisionTargetResolver'] as const,
  register({ commandBus, ipcRouter, scoringDecisionRepository, scoringDecisionTargetResolver }) {
    const appendHandler = new AppendScoringDecisionHandler(scoringDecisionRepository, scoringDecisionTargetResolver);
    const revokeHandler = new RevokeScoringDecisionHandler(scoringDecisionRepository);

    commandBus.register(AppendScoringDecisionToken, async (input) => appendHandler.execute(input));
    commandBus.register(RevokeScoringDecisionToken, async (input) => revokeHandler.execute(input));

    ipcRouter.register(scoringDecisionsContract, {
      add: (input) => commandBus.execute(AppendScoringDecisionToken, input),
      revoke: (input) => commandBus.execute(RevokeScoringDecisionToken, input),
      listByResult: async ({ resultId, resultScope }) => {
        const result = await scoringDecisionTargetResolver.resolve(resultId, resultScope);
        if (!result) throw new Error(`${resultScope} result ${resultId} was not found`);
        const history = scoringDecisionRepository.findByTarget(
          result.eventId,
          result.participantId,
          result.relayNumber,
          result.resultScope,
        );
        return { decisions: toScoringDecisionDtos(history) };
      },
    });
  },
};
