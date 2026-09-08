import type {
  adjudicationCasesContract,
  athleteSanctionsContract,
  boardContract,
  ChampionshipDetailDto,
  ChampionshipListResponse,
  CommandResponseDto,
  competitionAnnouncementsContract,
  CompetitionTypeListResponse,
  CreateChampionshipPayload,
  CreateEventPayload,
  debugContract,
  DeleteChampionshipPayload,
  DeleteEventPayload,
  eliminationPlanningContract,
  estBackupVerificationContract,
  backupCaptureReadinessContract,
  estChampionshipInspectionsContract,
  estComplaintsContract,
  eventsContract,
  evidenceFilesContract,
  finalControlContract,
  finalOperationsContract,
  finalPlacementReviewContract,
  finalRecoveriesContract,
  FiringPointAssignmentListResponse,
  incidentReportsContract,
  IpcErrorDto,
  irregularShotCasesContract,
  laneControlContract,
  malfunctionScoreApplicationsContract,
  mixedTeamFinalControlContract,
  mixedTeamTimeoutsContract,
  mqttContract,
  operationalArchivesContract,
  ParticipantListResponse,
  postCompetitionEquipmentControlContract,
  productionOperationsContract,
  protestsContract,
  qualificationMalfunctionsContract,
  rangeInterruptionsContract,
  relayAthleteLifecycleContract,
  relayReadinessContract,
  resultPublicationContract,
  publicationReviewPolicyContract,
  resultsBooksContract,
  resultsContract,
  resultVerificationContract,
  SaveFiringPointAssignmentsPayload,
  SaveParticipantsPayload,
  scoreCorrectionsContract,
  observationReviewsContract,
  reserveLaneTransfersContract,
  finalRecoveryFiringContract,
  scoringDecisionsContract,
  shootoffContract,
  squaddingContract,
  startListsContract,
  targetExaminationsContract,
  teamResultsContract,
  UpdateChampionshipPayload,
  UpdateEventPayload,
} from '@/shared/ipc/contracts';
import type { equipmentRegistryContract } from '@/shared/ipc/contracts/equipmentRegistry.contract';
import type { operationalProfilesContract } from '@/shared/ipc/contracts/operationalProfiles.contract';
import type { operatorAccessContract } from '@/shared/ipc/contracts/operatorAccess.contract';
/**
 * ElectronAPI - Renderer-side type definitions for the preload bridge.
 *
 * Uses InferBridge/InferEventBridge where method names match contract keys.
 * Championship uses manual types because their method names differ from contract keys.
 */
import type { InferBridge, InferEventBridge } from '@/shared/ipc/defineContract';

// ---------------------------------------------------------------------------
// Championship namespace (custom method names, not InferBridge-compatible)
// ---------------------------------------------------------------------------

interface IpcChampionship {
  createChampionship: (payload: CreateChampionshipPayload) => Promise<CommandResponseDto & { data?: string }>;
  updateChampionship: (payload: UpdateChampionshipPayload) => Promise<CommandResponseDto>;
  deleteChampionship: (payload: DeleteChampionshipPayload) => Promise<CommandResponseDto>;
  createEvent: (payload: CreateEventPayload) => Promise<CommandResponseDto & { data?: string }>;
  deleteEvent: (payload: DeleteEventPayload) => Promise<CommandResponseDto>;
  updateEvent: (payload: UpdateEventPayload) => Promise<CommandResponseDto>;
  saveParticipants: (
    payload: SaveParticipantsPayload,
  ) => Promise<{ success: true; data: ParticipantListResponse } | { success: false; error: IpcErrorDto }>;
  saveFiringPointAssignments: (
    payload: SaveFiringPointAssignmentsPayload,
  ) => Promise<{ success: true; data: FiringPointAssignmentListResponse } | { success: false; error: IpcErrorDto }>;
  getChampionships: () => Promise<
    { success: true; data: ChampionshipListResponse } | { success: false; data: null; error: IpcErrorDto }
  >;
  getChampionshipDetail: (payload: {
    id: string;
  }) => Promise<
    { success: true; data: ChampionshipDetailDto | null } | { success: false; data: null; error: IpcErrorDto }
  >;
  getParticipants: (payload: {
    eventId: string;
  }) => Promise<{ success: true; data: ParticipantListResponse } | { success: false; data: null; error: IpcErrorDto }>;
  getFiringPointAssignments: (payload: {
    eventId: string;
  }) => Promise<
    { success: true; data: FiringPointAssignmentListResponse } | { success: false; data: null; error: IpcErrorDto }
  >;
  getCompetitionTypes: () => Promise<
    { success: true; data: CompetitionTypeListResponse } | { success: false; data: null; error: IpcErrorDto }
  >;
}

// ---------------------------------------------------------------------------
// Debug queries namespace
// ---------------------------------------------------------------------------

type IpcQueries = InferBridge<typeof debugContract>;

// ---------------------------------------------------------------------------
// ElectronAPI
// ---------------------------------------------------------------------------

export interface ElectronAPI {
  operatorAccess: InferBridge<typeof operatorAccessContract>;
  equipmentRegistry: InferBridge<typeof equipmentRegistryContract>;
  operationalProfiles: InferBridge<typeof operationalProfilesContract>;
  /** Application version from package.json. */
  readonly appVersion: string;
  queries: IpcQueries;
  championship: IpcChampionship;
  athleteSanctions: InferBridge<typeof athleteSanctionsContract>;
  laneControl: InferBridge<typeof laneControlContract>;
  results: InferBridge<typeof resultsContract>;
  scoringDecisions: InferBridge<typeof scoringDecisionsContract>;
  resultVerification: InferBridge<typeof resultVerificationContract>;
  resultPublication: InferBridge<typeof resultPublicationContract>;
  publicationReviewPolicy: InferBridge<typeof publicationReviewPolicyContract>;
  competitionAnnouncements: InferBridge<typeof competitionAnnouncementsContract>;
  incidentReports: InferBridge<typeof incidentReportsContract>;
  targetExaminations: InferBridge<typeof targetExaminationsContract>;
  evidenceFiles: InferBridge<typeof evidenceFilesContract>;
  malfunctionScoreApplications: InferBridge<typeof malfunctionScoreApplicationsContract>;
  scoreCorrections: InferBridge<typeof scoreCorrectionsContract>;
  observationReviews: InferBridge<typeof observationReviewsContract>;
  reserveLaneTransfers: InferBridge<typeof reserveLaneTransfersContract>;
  finalRecoveryFiring: InferBridge<typeof finalRecoveryFiringContract>;
  estComplaints: InferBridge<typeof estComplaintsContract>;
  rangeInterruptions: InferBridge<typeof rangeInterruptionsContract>;
  relayReadiness: InferBridge<typeof relayReadinessContract>;
  relayAthleteLifecycle: InferBridge<typeof relayAthleteLifecycleContract>;
  teamResults: InferBridge<typeof teamResultsContract>;
  protests: InferBridge<typeof protestsContract>;
  estBackupVerification: InferBridge<typeof estBackupVerificationContract>;
  backupCaptureReadiness: InferBridge<typeof backupCaptureReadinessContract>;
  finalControl: InferBridge<typeof finalControlContract>;
  finalOperations: InferBridge<typeof finalOperationsContract>;
  finalRecoveries: InferBridge<typeof finalRecoveriesContract>;
  qualificationMalfunctions: InferBridge<typeof qualificationMalfunctionsContract>;
  adjudicationCases: InferBridge<typeof adjudicationCasesContract>;
  irregularShotCases: InferBridge<typeof irregularShotCasesContract>;
  operationalArchives: InferBridge<typeof operationalArchivesContract>;
  estChampionshipInspections: InferBridge<typeof estChampionshipInspectionsContract>;
  postCompetitionEquipmentControl: InferBridge<typeof postCompetitionEquipmentControlContract>;
  eliminationPlanning: InferBridge<typeof eliminationPlanningContract>;
  resultsBooks: InferBridge<typeof resultsBooksContract>;
  startLists: InferBridge<typeof startListsContract>;
  mixedTeamFinalControl: InferBridge<typeof mixedTeamFinalControlContract>;
  squadding: InferBridge<typeof squaddingContract>;
  productionOperations: InferBridge<typeof productionOperationsContract>;
  mixedTeamTimeouts: InferBridge<typeof mixedTeamTimeoutsContract>;
  finalPlacementReview: InferBridge<typeof finalPlacementReviewContract>;
  board: InferBridge<typeof boardContract>;
  shootoff: InferBridge<typeof shootoffContract>;
  mqtt: InferBridge<typeof mqttContract>;
  on: InferEventBridge<typeof eventsContract>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
