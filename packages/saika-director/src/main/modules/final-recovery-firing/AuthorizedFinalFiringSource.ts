import type { IFinalRecoveryRepository } from '@/main/modules/final-recoveries';
import { finalRecoveryStatus } from '@/main/modules/final-recoveries';
import { MalfunctionFiringRequestSchema } from '@/shared/mqtt/MalfunctionFiring';

import type { FinalFiringIntent, IFinalFiringAuthorizationSource } from './FinalRecoveryFiringService';

type Context = {
  sessionId: string;
  participantId: string;
  rulePackFingerprint: string;
  stageIndex: number;
  seriesIndex: number;
  recordedShots: number;
  seriesShotLimit: number;
};
export class AuthorizedFinalFiringSource implements IFinalFiringAuthorizationSource {
  constructor(
    private readonly recoveries: IFinalRecoveryRepository,
    private readonly context: (competitionId: string, laneId: string) => Promise<Context>,
  ) {}
  assertAuthorized(intent: FinalFiringIntent): void {
    this.authorization(intent);
  }
  async prepare(intent: FinalFiringIntent) {
    const { value, authorization } = this.authorization(intent);
    const current = await this.context(value.competitionId, intent.laneId);
    this.authorization(intent);
    if (value.allowanceSubject?.kind === 'ATHLETE' && value.allowanceSubject.key !== current.participantId)
      throw new Error('The finalist differs from the athlete bound to this recovery');
    const repeat = authorization.remedy === 'REPEAT_SERIES';
    const remainingShots = current.seriesShotLimit - current.recordedShots;
    const shotsToFire = repeat ? current.seriesShotLimit : value.incidentType === 'EST_FAILURE' ? 1 : remainingShots;
    if (
      current.seriesShotLimit !== 5 ||
      authorization.shotCount !== shotsToFire ||
      (!repeat && value.incidentType === 'MALFUNCTION' && remainingShots <= 0)
    )
      throw new Error('Authorize the exact recovery shot count for the current five-shot series');
    return MalfunctionFiringRequestSchema.parse({
      workflow: 'FINAL_RECOVERY',
      finalIncident: value.incidentType,
      runId: intent.id,
      competitionId: value.competitionId,
      caseId: value.id,
      authorizationId: authorization.id,
      ...current,
      remedy: repeat ? 'REPEAT_FULL_SERIES' : 'COMPLETE_REMAINING_SHOTS',
      shotsToFire,
      officialName: authorization.officialName,
      decidedAt: authorization.recordedAt.toISOString(),
      loadAt: intent.loadAt,
    });
  }
  private authorization(intent: FinalFiringIntent) {
    const value = this.recoveries.findCaseById(intent.caseId);
    if (!value || !value.affectedLaneIds.includes(intent.laneId))
      throw new Error('Recovery case does not cover this Lane');
    if (
      !['PISTOL_25M_RAPID_FIRE', 'PISTOL_25M_WOMEN'].includes(value.procedureProfile) ||
      value.phase !== 'MATCH_SERIES' ||
      !['MALFUNCTION', 'EST_FAILURE'].includes(value.incidentType)
    )
      throw new Error('Isolated execution currently supports 25m Final MATCH series recoveries');
    const entries = this.recoveries.findEntries([value.id]).get(value.id) ?? [];
    if (!['RECOVERY_AUTHORIZED', 'RESUMED'].includes(finalRecoveryStatus(entries)))
      throw new Error('A current Jury firing authorization is required');
    const authorization = entries.filter((entry) => entry.type === 'REMEDY_AUTHORIZED').at(-1);
    const ruling = entries.filter((entry) => entry.type === 'JURY_RULING').at(-1);
    const expected = value.procedureProfile === 'PISTOL_25M_RAPID_FIRE' ? 'REPEAT_SERIES' : 'COMPLETE_SERIES';
    if (
      !authorization ||
      authorization.id !== intent.authorizationId ||
      authorization.remedy !== expected ||
      (value.incidentType === 'EST_FAILURE' &&
        value.procedureProfile === 'PISTOL_25M_WOMEN' &&
        authorization.shotCount !== 1) ||
      ruling?.classification !== (value.incidentType === 'MALFUNCTION' ? 'ALLOWABLE_MALFUNCTION' : 'TARGET_MALFUNCTION')
    )
      throw new Error('The latest Jury ruling and authorization do not permit this recovery firing');
    return { value, authorization };
  }
}
