/**
 * Championship IPC Contract
 *
 * Self-contained contract for championship-related IPC procedures.
 * All Zod schemas are defined inline — no imports from ipcSchemas.ts.
 */
import { z } from 'zod';
import {
  defineContract,
  command,
  query,
  CommandResponseSchema,
  commandDataResponseSchema,
  commandWithDataSchema,
  queryResponseSchema,
} from '../defineContract';

// ---------------------------------------------------------------------------
// Shared sub-schemas
// ---------------------------------------------------------------------------

const uuidSchema = z.string().uuid();
const eventTypeSchema = z.string();
const roundSchema = z.enum(['Elimination', 'Qualification', 'Final', 'Individual']);

// ---------------------------------------------------------------------------
// Input schemas (command payloads)
// ---------------------------------------------------------------------------

const CreateChampionshipPayloadSchema = z.object({
  name: z.string().min(1),
  date: z.string().min(1),
  venue: z.string().min(1),
});

const UpdateChampionshipPayloadSchema = z.object({
  id: uuidSchema,
  name: z.string().min(1).optional(),
  date: z.string().min(1).optional(),
  venue: z.string().min(1).optional(),
});

const DeleteChampionshipPayloadSchema = z.object({
  id: uuidSchema,
});

const CreateEventPayloadSchema = z.object({
  championshipId: uuidSchema,
  name: z.string().min(1),
  eventType: eventTypeSchema,
});

const DeleteEventPayloadSchema = z.object({
  id: uuidSchema,
});

const UpdateEventPayloadSchema = z.object({
  id: uuidSchema,
  name: z.string().min(1),
  eventType: eventTypeSchema,
});

const SaveParticipantsPayloadSchema = z.object({
  eventId: uuidSchema,
  participants: z.array(
    z.object({
      id: z.string().optional(),
      playerName: z.string(),
      affiliation: z.string(),
      logoPath: z.string().optional(),
    }),
  ),
  participantIdsToDelete: z.array(uuidSchema).optional(),
});

const SaveFiringPointAssignmentsPayloadSchema = z.object({
  eventId: uuidSchema,
  assignments: z.array(
    z.object({
      relayNumber: z.number().int().positive(),
      firingPointNumber: z.number().int().positive(),
      participantId: uuidSchema,
    }),
  ),
});

const GetChampionshipDetailPayloadSchema = z.object({
  id: uuidSchema,
});

const GetParticipantsPayloadSchema = z.object({
  eventId: uuidSchema,
});

const GetFiringPointAssignmentsPayloadSchema = z.object({
  eventId: uuidSchema,
});

// ---------------------------------------------------------------------------
// Response schemas (matching IpcResponses.ts interfaces)
// ---------------------------------------------------------------------------

const championshipDtoSchema = z.object({
  id: z.string(),
  name: z.string(),
  date: z.string(),
  venue: z.string(),
  createdAt: z.string(),
});

const eventDtoSchema = z.object({
  id: z.string(),
  name: z.string(),
  eventType: eventTypeSchema,
  round: roundSchema,
  sortOrder: z.number(),
});

const championshipDetailDtoSchema = championshipDtoSchema.extend({
  events: z.array(eventDtoSchema),
});

const participantDtoSchema = z.object({
  id: z.string(),
  playerName: z.string(),
  affiliation: z.string(),
  logoPath: z.string().nullable(),
  sortOrder: z.number(),
});

const firingPointAssignmentDtoSchema = z.object({
  id: z.string(),
  relayNumber: z.number(),
  firingPointNumber: z.number(),
  participantId: z.string(),
});

const ChampionshipListResponseSchema = z.object({
  championships: z.array(championshipDtoSchema),
});

const ParticipantListResponseSchema = z.object({
  participants: z.array(participantDtoSchema),
});

const FiringPointAssignmentListResponseSchema = z.object({
  assignments: z.array(firingPointAssignmentDtoSchema),
});

const competitionTypeDtoSchema = z.object({
  id: z.string(),
  name: z.string(),
});

const CompetitionTypeListResponseSchema = z.object({
  types: z.array(competitionTypeDtoSchema),
});

// ---------------------------------------------------------------------------
// Contract definition
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Inferred types (replacing legacy IpcPayloads/IpcResponses interfaces)
// ---------------------------------------------------------------------------

// Response DTOs
export type ChampionshipDto = z.infer<typeof championshipDtoSchema>;
export type EventDto = z.infer<typeof eventDtoSchema>;
export type ChampionshipDetailDto = z.infer<typeof championshipDetailDtoSchema>;
/** @deprecated Use ChampionshipDetailDto */
export type ChampionshipDetailResponse = ChampionshipDetailDto;
export type ParticipantDto = z.infer<typeof participantDtoSchema>;
export type FiringPointAssignmentDto = z.infer<typeof firingPointAssignmentDtoSchema>;
export type ChampionshipListResponse = z.infer<typeof ChampionshipListResponseSchema>;
export type ParticipantListResponse = z.infer<typeof ParticipantListResponseSchema>;
export type FiringPointAssignmentListResponse = z.infer<typeof FiringPointAssignmentListResponseSchema>;
export type CompetitionTypeDto = z.infer<typeof competitionTypeDtoSchema>;
export type CompetitionTypeListResponse = z.infer<typeof CompetitionTypeListResponseSchema>;

// Input payloads
export type CreateChampionshipPayload = z.infer<typeof CreateChampionshipPayloadSchema>;
export type UpdateChampionshipPayload = z.infer<typeof UpdateChampionshipPayloadSchema>;
export type DeleteChampionshipPayload = z.infer<typeof DeleteChampionshipPayloadSchema>;
export type CreateEventPayload = z.infer<typeof CreateEventPayloadSchema>;
export type DeleteEventPayload = z.infer<typeof DeleteEventPayloadSchema>;
export type UpdateEventPayload = z.infer<typeof UpdateEventPayloadSchema>;
export type SaveParticipantsPayload = z.infer<typeof SaveParticipantsPayloadSchema>;
export type SaveFiringPointAssignmentsPayload = z.infer<typeof SaveFiringPointAssignmentsPayloadSchema>;

// ---------------------------------------------------------------------------
// Contract definition
// ---------------------------------------------------------------------------

export const championshipContract = defineContract('championship', {
  // Commands
  create: command(CreateChampionshipPayloadSchema, commandWithDataSchema(z.string())),
  update: command(UpdateChampionshipPayloadSchema, CommandResponseSchema),
  delete: command(DeleteChampionshipPayloadSchema, CommandResponseSchema),
  createEvent: command(CreateEventPayloadSchema, commandWithDataSchema(z.string())),
  deleteEvent: command(DeleteEventPayloadSchema, CommandResponseSchema),
  updateEvent: command(UpdateEventPayloadSchema, CommandResponseSchema),
  saveParticipants: command(SaveParticipantsPayloadSchema, commandDataResponseSchema(ParticipantListResponseSchema)),
  saveFiringPointAssignments: command(
    SaveFiringPointAssignmentsPayloadSchema,
    commandDataResponseSchema(FiringPointAssignmentListResponseSchema),
  ),

  // Queries
  getAll: query(z.void(), queryResponseSchema(ChampionshipListResponseSchema)),
  getDetail: query(GetChampionshipDetailPayloadSchema, queryResponseSchema(z.nullable(championshipDetailDtoSchema))),
  getParticipants: query(GetParticipantsPayloadSchema, queryResponseSchema(ParticipantListResponseSchema)),
  getFiringPointAssignments: query(
    GetFiringPointAssignmentsPayloadSchema,
    queryResponseSchema(FiringPointAssignmentListResponseSchema),
  ),
  getCompetitionTypes: query(z.void(), queryResponseSchema(CompetitionTypeListResponseSchema)),
});
