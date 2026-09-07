import { planFinalRecoveryFiring } from '@sasakiuri/saika-rules';

import type { ICompetitionRepository } from '@/main/modules/competition/domain/ICompetitionRepository';
import type { IMalfunctionFiringContextSource, MalfunctionFiringRequest } from '@/main/modules/malfunction-firing';

import type { ILaneAssignmentSnapshotSource } from './LaneQualificationMalfunctionContextSource';

/** Live Final identity adapter; the isolated recorder has no dependency on the Jury ledger. */
export class AssignedFinalRecoveryFiringContextSource implements IMalfunctionFiringContextSource {
  constructor(
    private readonly competitions: ICompetitionRepository,
    private readonly assignments: ILaneAssignmentSnapshotSource,
    private readonly mayFire: () => boolean,
  ) {}
  async prepare(request: MalfunctionFiringRequest) {
    const competition = await this.competitions.findActive();
    if (
      request.workflow !== 'FINAL_RECOVERY' ||
      !request.finalIncident ||
      !competition ||
      competition.id !== request.competitionId ||
      competition.config.name !== 'Final' ||
      !['ACTIVE', 'SERIES_COMPLETE'].includes(competition.phase)
    )
      throw new Error('Recovery firing requires the active Final competition');
    if (
      competition.sessionId !== request.sessionId ||
      competition.currentStageIndex !== request.stageIndex ||
      competition.currentSeriesIndex !== request.seriesIndex ||
      competition.seriesShotCount !== request.recordedShots
    )
      throw new Error('Recovery authorization differs from the current Final series');
    if (this.assignments.getCurrentAssignment(competition.id)?.athlete?.id !== request.participantId)
      throw new Error('The assigned finalist has changed');
    const config = competition.config;
    if (config.rulePackIdentity?.fingerprint.value !== request.rulePackFingerprint)
      throw new Error('The Final Rule Pack has changed');
    const stage = competition.currentStageConfig;
    const recovery = config.timedTarget?.recovery;
    const matchProgram = config.timedTarget?.programs.find(
      (program) => program.id === competition.currentSeriesConfig.timedTargetProgramId,
    );
    const targetProfileId = stage.targetProfileId ?? config.targetProfileId;
    if (!stage.scored || recovery?.procedure !== 'FINAL' || !matchProgram || !targetProfileId)
      throw new Error('This stage has no 25m Final recovery firing capability');
    if (!this.mayFire()) throw new Error('Range safety STOP is active');
    return {
      targetProfileId,
      plan: planFinalRecoveryFiring({
        incidentType: request.finalIncident,
        recovery,
        matchProgram,
        seriesShotLimit: competition.currentSeriesConfig.maxShots,
        recordedShots: request.recordedShots,
      }),
    };
  }
}
