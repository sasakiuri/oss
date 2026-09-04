// Value Objects (used cross-module)
export { EventId } from './domain/EventId';
export { ParticipantId } from './domain/ParticipantId';
export { Participant } from './domain/Participant';
export { FiringPointAssignment } from './domain/FiringPointAssignment';
export { FiringPointAssignmentId } from './domain/FiringPointAssignmentId';
export type { ParticipantGender, ParticipantEntryStatus, ParticipantOfficialEntry } from './domain/Participant';
export type { IParticipantRepository } from './domain/IParticipantRepository';
export type { IEventRepository } from './domain/IEventRepository';
export { SqliteParticipantRepository } from './infra/SqliteParticipantRepository';
export { SqliteEventRepository } from './infra/SqliteEventRepository';
export { SqliteFiringPointAssignmentRepository } from './infra/SqliteFiringPointAssignmentRepository';

// Cross-module query token & types (used by board & results modules)
export { GetEventByIdToken, GetFiringPointAssignmentsByRelayToken } from './championship.module';
export type {
  GetEventByIdQuery,
  GetEventByIdResponse,
  GetFiringPointAssignmentsByRelayQuery,
  RelayFiringPointAssignment,
} from './championship.module';

// Module definition
export { championshipModule } from './championship.module';
