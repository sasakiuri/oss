import type { IpcInvocation } from '@/main/shared-infra/ipc/IpcInvocationMiddleware';
import type { OperatorPermission } from '@/shared/ipc/contracts/operatorAccess.contract';

const groups: Record<string, OperatorPermission> = {};
for (const namespace of [
  'mqtt',
  'unified-lane-control',
  'finalControl',
  'finalOperations',
  'mixedTeamFinalControl',
  'mixedTeamTimeouts',
  'shootoff',
  'competitionAnnouncements',
  'rangeInterruptions',
  'reserveLaneTransfers',
  'finalRecoveryFiring',
  'productionOperations',
  'board',
  'relayReadiness',
  'relayAthleteLifecycle',
  'operationalProfiles',
  'backupCaptureReadiness',
])
  groups[namespace] = 'OPERATE';
for (const namespace of [
  'results',
  'scoringDecisions',
  'resultVerification',
  'resultPublication',
  'publicationReviewPolicy',
  'incidentReports',
  'targetExaminations',
  'estComplaints',
  'teamResults',
  'protests',
  'estBackupVerification',
  'finalRecoveries',
  'qualificationMalfunctions',
  'adjudicationCases',
  'irregularShotCases',
  'malfunctionScoreApplications',
  'scoreCorrections',
  'observationReviews',
  'finalPlacementReview',
  'resultsBooks',
  'athleteSanctions',
])
  groups[namespace] = 'OFFICIATE';
for (const namespace of ['estChampionshipInspections', 'equipmentRegistry', 'postCompetitionEquipmentControl'])
  groups[namespace] = 'EQUIPMENT';

/** Unclassified commands require administration until deliberately assigned a narrower permission. */
export function directorOperatorPermission({ namespace, operation }: IpcInvocation): OperatorPermission {
  if (namespace === 'board' && ['openProtestPrint', 'openEstBackupSourcePrint'].includes(operation)) return 'OFFICIATE';
  if (namespace === 'resultsBooks' && ['appointOfficial', 'revokeOfficial'].includes(operation)) return 'ADMIN';
  if (
    ['finalControl', 'mixedTeamFinalControl'].includes(namespace) &&
    ['recordDecision', 'voidDecision'].includes(operation)
  )
    return 'OFFICIATE';
  if (
    namespace === 'rangeInterruptions' &&
    [
      'appendEntry',
      'recordTargetRecovery',
      'recordQualificationTimedTargetRecoveryDecision',
      'adjudicateQualificationRecoveryExecution',
      'applyQualificationRecoverySettlement',
    ].includes(operation)
  )
    return 'OFFICIATE';
  if (
    namespace === 'mqtt' &&
    ['setBrokerConfig', 'startBroker', 'stopBroker', 'connect', 'disconnect'].includes(operation)
  )
    return 'ADMIN';
  if (namespace === 'unified-lane-control' && ['editShot', 'deleteShot', 'insertShot', 'eliminate'].includes(operation))
    return 'OFFICIATE';
  return groups[namespace] ?? 'ADMIN';
}
