import type { IpcInvocation } from '@/main/shared-infra/ipc/IpcInvocationMiddleware';
import type { OperatorPermission } from '@/shared/ipc/contracts';
import type { directorBridgeContracts } from '@/shared/ipc/directorBridgeContracts';

type DirectorContractNamespace = (typeof directorBridgeContracts)[keyof typeof directorBridgeContracts]['namespace'];

/**
 * The permission each contract namespace requires for its commands. Every namespace exposed to the renderer
 * must be listed: a new contract without an entry fails typecheck instead of silently requiring ADMIN.
 * `operatorAccess` authorizes its own operations and never consults this table.
 */
const namespacePermissions: Record<DirectorContractNamespace, OperatorPermission> = {
  backupCaptureReadiness: 'OPERATE',
  board: 'OPERATE',
  competitionAnnouncements: 'OPERATE',
  finalControl: 'OPERATE',
  finalOperations: 'OPERATE',
  finalRecoveryFiring: 'OPERATE',
  mixedTeamFinalControl: 'OPERATE',
  mixedTeamTimeouts: 'OPERATE',
  mqtt: 'OPERATE',
  operationalProfiles: 'OPERATE',
  operationalTemplates: 'OPERATE',
  productionOperations: 'OPERATE',
  rangeInterruptions: 'OPERATE',
  relayAthleteLifecycle: 'OPERATE',
  relayReadiness: 'OPERATE',
  reserveLaneTransfers: 'OPERATE',
  shootoff: 'OPERATE',
  'unified-lane-control': 'OPERATE',
  adjudicationCases: 'OFFICIATE',
  athleteSanctions: 'OFFICIATE',
  estBackupVerification: 'OFFICIATE',
  estComplaints: 'OFFICIATE',
  finalPlacementReview: 'OFFICIATE',
  finalRecoveries: 'OFFICIATE',
  incidentReports: 'OFFICIATE',
  irregularShotCases: 'OFFICIATE',
  malfunctionScoreApplications: 'OFFICIATE',
  observationReviews: 'OFFICIATE',
  protests: 'OFFICIATE',
  publicationReviewPolicy: 'OFFICIATE',
  qualificationMalfunctions: 'OFFICIATE',
  resultPublication: 'OFFICIATE',
  resultVerification: 'OFFICIATE',
  results: 'OFFICIATE',
  resultsBooks: 'OFFICIATE',
  scoreCorrections: 'OFFICIATE',
  scoringDecisions: 'OFFICIATE',
  targetExaminations: 'OFFICIATE',
  teamResults: 'OFFICIATE',
  equipmentRegistry: 'EQUIPMENT',
  estChampionshipInspections: 'EQUIPMENT',
  postCompetitionEquipmentControl: 'EQUIPMENT',
  championship: 'ADMIN',
  eliminationPlanning: 'ADMIN',
  evidenceFiles: 'ADMIN',
  operationalArchives: 'ADMIN',
  operatorAccess: 'ADMIN',
  squadding: 'ADMIN',
  startLists: 'ADMIN',
  updater: 'ADMIN',
  vista: 'ADMIN',
};

/** The permission a command needs; the operations named here differ from their namespace. */
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
  return Object.hasOwn(namespacePermissions, namespace)
    ? namespacePermissions[namespace as DirectorContractNamespace]
    : 'ADMIN';
}
