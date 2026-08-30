export interface MixedTeamTimeoutEntryRecord {
  id: string;
  timeoutId: string;
  entryType: 'CLOSED' | 'VOID';
  officialName: string;
  statement: string;
  recordedAt: string;
}

export interface MixedTeamTimeoutRecord {
  id: string;
  competitionId: string;
  requestingTeamId: string;
  courtesyTeamIds: string[];
  requestedByRole: 'COACH' | 'ATHLETE';
  requestedByName: string;
  afterShot: number;
  durationSeconds: 30;
  officialName: string;
  statement: string;
  startedAt: string;
  expiresAt: string;
  entries: MixedTeamTimeoutEntryRecord[];
}

export interface IMixedTeamTimeoutRepository {
  appendSession(session: Omit<MixedTeamTimeoutRecord, 'entries'>): void;
  appendEntry(entry: MixedTeamTimeoutEntryRecord): void;
  findByCompetition(competitionId: string): MixedTeamTimeoutRecord[];
  findById(id: string): MixedTeamTimeoutRecord | null;
}
