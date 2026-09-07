import { planQualificationMalfunctionFiring } from '@sasakiuri/saika-rules';

import type { ICompetitionRepository } from '@/main/modules/competition/domain/ICompetitionRepository';
import type { IMalfunctionFiringContextSource, MalfunctionFiringRequest } from '@/main/modules/malfunction-firing';

import type { ILaneAssignmentSnapshotSource } from './LaneQualificationMalfunctionContextSource';

export class AssignedMalfunctionFiringContextSource implements IMalfunctionFiringContextSource {
  constructor(
    private readonly competitions: ICompetitionRepository,
    private readonly assignments: ILaneAssignmentSnapshotSource,
    private readonly mayFire: () => boolean,
  ) {}

  async prepare(request: MalfunctionFiringRequest) {
    if (request.workflow) throw new Error('Qualification context cannot authorize Final firing');
    const competition = await this.competitions.findActive();
    if (
      !competition ||
      competition.id !== request.competitionId ||
      !['ACTIVE', 'SERIES_COMPLETE'].includes(competition.phase) ||
      competition.config.name !== 'Qualification'
    )
      throw new Error('Malfunction firing requires the active Qualification competition');
    if (
      competition.sessionId !== request.sessionId ||
      competition.currentStageIndex !== request.stageIndex ||
      competition.currentSeriesIndex !== request.seriesIndex ||
      competition.seriesShotCount !== request.recordedShots
    )
      throw new Error('Malfunction firing does not match the current Lane series and session');
    const assignment = this.assignments.getCurrentAssignment(competition.id);
    if (assignment?.athlete?.id !== request.participantId) throw new Error('The assigned athlete has changed');
    const config = competition.config;
    if (config.rulePackIdentity?.fingerprint.value !== request.rulePackFingerprint)
      throw new Error('The Lane Rule Pack does not match the authorization');
    const stage = competition.currentStageConfig;
    const stageRule = config.qualificationMalfunction?.stages.find((rule) => rule.stageId === stage.id);
    const matchProgram = config.timedTarget?.programs.find(
      (program) => program.id === competition.currentSeriesConfig.timedTargetProgramId,
    );
    const targetProfileId = stage.targetProfileId ?? config.targetProfileId;
    if (!stage.scored || !stageRule || !matchProgram || !targetProfileId)
      throw new Error('The Lane has no malfunction firing capability for this stage');
    if (!this.mayFire()) throw new Error('Range safety STOP is active');
    return {
      targetProfileId,
      plan: planQualificationMalfunctionFiring({
        stageRule,
        matchProgram,
        seriesShotLimit: competition.currentSeriesConfig.maxShots,
        recordedShots: request.recordedShots,
      }),
    };
  }
}
