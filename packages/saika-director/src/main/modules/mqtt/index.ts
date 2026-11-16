// Module definition
export { mqttModule } from './mqtt.module';

// Public evidence port and composition-root adapter
export { SqliteCompetitionShotJournal } from './infra/SqliteCompetitionShotJournal';
export type { CompetitionShotObservation, ICompetitionShotJournal } from './domain/ICompetitionShotJournal';
export type {
  IShotObservationEvidenceJournal,
  ShotObservationEvidenceRecord,
} from './domain/IShotObservationEvidenceJournal';
export { SqliteShotObservationEvidenceJournal } from './infra/SqliteShotObservationEvidenceJournal';
export { SqliteFiringWindowJournal } from './infra/SqliteFiringWindowJournal';
export type {
  ISafetyStopAuditJournal,
  SafetyStopAuditEntry,
  SafetyStopFirearmCondition,
  SafetyStopLaneClearance,
  SafetyStopAuditOperation,
  SafetyStopLaneOutcome,
} from './domain/ISafetyStopAuditJournal';
export { SafetyStopClearancePolicy } from './domain/SafetyStopClearancePolicy';
export type {
  FiringBoundarySignal,
  FiringCommandBoundary,
  FiringWindowViolation,
  IFiringWindowJournal,
} from './domain/IFiringWindowJournal';

export type {
  ShotReceived,
  LaneConnected,
  MqttConnectionError,
  MqttControlStateChanged,
  FiringWindowViolationDetected,
} from './domain/events';
