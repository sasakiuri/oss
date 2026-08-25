// Value Objects (used cross-module)
export { EventId } from './domain/EventId';
export { ParticipantId } from './domain/ParticipantId';

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
