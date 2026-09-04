import type { ModuleDefinition } from '@/main/shared-infra/module/ModuleDefinition';
import { scoringDecisionsContract } from '@/shared/ipc/contracts';
import { AppendScoringDecisionHandler } from './application/AppendScoringDecisionHandler';
import { RevokeScoringDecisionHandler } from './application/RevokeScoringDecisionHandler';
import { toScoringDecisionDtos } from './application/toScoringDecisionDto';
import { AppendScoringDecisionToken, RevokeScoringDecisionToken } from './tokens';

export const scoringDecisionsModule: ModuleDefinition<
  | 'commandBus'
  | 'ipcRouter'
  | 'scoringDecisionRepository'
  | 'scoringDecisionTargetResolver'
  | 'scoringDecisionAdmissionPolicy'
> = {
  name: 'scoringDecisions',
  deps: [
    'commandBus',
    'ipcRouter',
    'scoringDecisionRepository',
    'scoringDecisionTargetResolver',
    'scoringDecisionAdmissionPolicy',
  ] as const,
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
              ].sort(
                (left, right) =>
                  left.decidedAt.getTime() - right.decidedAt.getTime() || left.id.localeCompare(right.id),
              ),
        ),
      }),
    });
  },
};
