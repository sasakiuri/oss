import { ParticipantId } from './ParticipantId';
import { EventId } from './EventId';

export const PARTICIPANT_GENDERS = ['M', 'F', 'X', 'UNSPECIFIED'] as const;
export const PARTICIPANT_ENTRY_STATUSES = ['COMPETING', 'RPO', 'MQS', 'OOC', 'DNS', 'DNF', 'DSQ', 'DQB'] as const;
export type ParticipantGender = (typeof PARTICIPANT_GENDERS)[number];
export type ParticipantEntryStatus = (typeof PARTICIPANT_ENTRY_STATUSES)[number];

export interface ParticipantOfficialEntry {
  startNumber: string | null;
  issfId: string | null;
  nationCode: string | null;
  gender: ParticipantGender;
  entryStatus: ParticipantEntryStatus;
  teamId: string | null;
  teamName: string | null;
}

export class Participant {
  private constructor(
    public readonly id: ParticipantId,
    public readonly eventId: EventId,
    public readonly playerName: string,
    public readonly affiliation: string,
    public readonly logoPath: string | null,
    public readonly sortOrder: number,
    /** Explicit ISSF family name used only for unresolved-tie display ordering. */
    public readonly familyName: string,
    public readonly officialEntry: ParticipantOfficialEntry,
  ) {}

  static create(
    id: ParticipantId,
    eventId: EventId,
    playerName: string,
    affiliation: string,
    logoPath: string | null = null,
    sortOrder: number = 0,
    familyName: string = playerName,
    officialEntry: Partial<ParticipantOfficialEntry> = {},
  ): Participant {
    if (!playerName.trim()) {
      throw new Error('Player name cannot be empty');
    }
    return new Participant(
      id,
      eventId,
      playerName.trim(),
      affiliation.trim(),
      logoPath,
      sortOrder,
      familyName.trim() || playerName.trim(),
      normalizeOfficialEntry(officialEntry),
    );
  }

  static reconstruct(
    id: ParticipantId,
    eventId: EventId,
    playerName: string,
    affiliation: string,
    logoPath: string | null,
    sortOrder: number,
    familyName: string = playerName,
    officialEntry: Partial<ParticipantOfficialEntry> = {},
  ): Participant {
    return new Participant(
      id,
      eventId,
      playerName,
      affiliation,
      logoPath,
      sortOrder,
      familyName || playerName,
      normalizeOfficialEntry(officialEntry),
    );
  }
}

function normalizeOfficialEntry(value: Partial<ParticipantOfficialEntry>): ParticipantOfficialEntry {
  const gender = value.gender ?? 'UNSPECIFIED';
  const entryStatus = value.entryStatus ?? 'COMPETING';
  if (!PARTICIPANT_GENDERS.includes(gender)) throw new Error('Participant gender is invalid');
  if (!PARTICIPANT_ENTRY_STATUSES.includes(entryStatus)) throw new Error('Participant entry status is invalid');
  const nationCode = optionalText(value.nationCode)?.toUpperCase() ?? null;
  if (nationCode && !/^[A-Z]{2,3}$/.test(nationCode)) throw new Error('Nation code must contain 2 or 3 letters');
  const teamId = optionalText(value.teamId);
  const teamName = optionalText(value.teamName);
  if (teamName && !teamId) throw new Error('A team name requires a team ID');
  return Object.freeze({
    startNumber: optionalText(value.startNumber),
    issfId: optionalText(value.issfId),
    nationCode,
    gender,
    entryStatus,
    teamId,
    teamName,
  });
}

function optionalText(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}
