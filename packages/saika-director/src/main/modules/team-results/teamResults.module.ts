import type { ModuleDefinition } from '@/main/shared-infra/module/ModuleDefinition';
import { teamResultsContract } from '@/shared/ipc/contracts';

export const teamResultsModule: ModuleDefinition<
  'ipcRouter' | 'teamResultsService' | 'mixedTeamFinalResultRepository'
> = {
  name: 'teamResults',
  deps: ['ipcRouter', 'teamResultsService', 'mixedTeamFinalResultRepository'] as const,
  register({ ipcRouter, teamResultsService: service, mixedTeamFinalResultRepository }) {
    ipcRouter.register(teamResultsContract, {
      getQualification: ({ eventId, format }) => service.getQualification(eventId, format),
      getMixedFinal: async ({ eventId }) =>
        mixedTeamFinalResultRepository.findByEvent(eventId).map((result) => ({
          id: result.id,
          eventId: result.eventId,
          sourceCompetitionId: result.sourceCompetitionId,
          teamId: result.teamId,
          teamName: result.teamName,
          nationCode: result.nationCode,
          rank: result.finalRank,
          stage1Total: result.stage1Total,
          stage2Total: result.stage2Total,
          totalScore: result.totalScore,
          eliminatedAtShot: result.eliminatedAtShot,
          shootoffId: result.shootoffId,
          remarks: result.remarks,
          members: result.members,
        })),
    });
  },
};
