// Module definition
export { mqttModule } from './mqtt.module';

// Public evidence port and composition-root adapter
export { SqliteCompetitionShotJournal } from './infra/SqliteCompetitionShotJournal';
export type { CompetitionShotObservation, ICompetitionShotJournal } from './domain/ICompetitionShotJournal';

export type {
  ShotReceived,
  LaneConnected,
  DebugLogEmitted,
  MqttConnectionError,
  MqttControlStateChanged,
} from './domain/events';
