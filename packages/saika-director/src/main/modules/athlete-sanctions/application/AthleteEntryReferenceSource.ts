import type { ParticipantEntryStatus } from '@/main/modules/championship';

export interface AthleteEntryReference {
  readonly participantId: string;
  readonly eventId: string;
  readonly eventName: string;
  readonly championshipId: string;
  readonly playerName: string;
  readonly issfId: string | null;
  readonly entryStatus: ParticipantEntryStatus;
}

export interface AthleteEventReference {
  readonly eventId: string;
  readonly championshipId: string;
  readonly eventName: string;
}

export interface IAthleteEntryReferenceSource {
  championshipExists(championshipId: string): boolean;
  findEvent(eventId: string): AthleteEventReference | null;
  findParticipant(participantId: string): AthleteEntryReference | null;
  findParticipantsByEvent(eventId: string): AthleteEntryReference[];
  findParticipantsByChampionship(championshipId: string): AthleteEntryReference[];
}
