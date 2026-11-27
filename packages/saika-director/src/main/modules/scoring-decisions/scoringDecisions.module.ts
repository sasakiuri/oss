import { defineModule } from '@/main/shared-infra/module/ModuleDefinition';
import { scoringDecisionsContract } from '@/shared/ipc/contracts';
import { AppendScoringDecisionHandler } from './application/AppendScoringDecisionHandler';
import { RevokeScoringDecisionHandler } from './application/RevokeScoringDecisionHandler';
import { toScoringDecisionDtos } from './application/toScoringDecisionDto';
import { compareDecisionOrder } from './domain/ScoringDecision';
import { AppendScoringDecisionToken, RevokeScoringDecisionToken } from './application/tokens';

export const scoringDecisionsModule = defineModule({
  name: 'scoringDecisions',
  deps: [
    'commandBus',
    'ipcRouter',
    'scoringDecisionRepository',
    'scoringDecisionTargetResolver',
    'scoringDecisionAdmissionPolicy',
  ],
  register({
    commandBus,
    ipcRouter,
    scoringDecisionRepository,
    scoringDecisionTargetResolver,
    scoringDecisionAdmissionPolicy,
  }) {
    const appendHandler = new AppendScoringDecisionHandler(
      scoringDecisionRepository,
      scoringDecisionTargetResolver,
      scoringDecisionAdmissionPolicy,
    );
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
      listByEvent: async ({ eventId, resultScope }) => ({
        decisions: toScoringDecisionDtos(
          resultScope
            ? scoringDecisionRepository.findByEventId(eventId, resultScope)
            : [
                ...scoringDecisionRepository.findByEventId(eventId, 'QUALIFICATION'),
                ...scoringDecisionRepository.findByEventId(eventId, 'FINAL'),
              ].sort(compareDecisionOrder),
        ),
      }),
    });
  },
});
