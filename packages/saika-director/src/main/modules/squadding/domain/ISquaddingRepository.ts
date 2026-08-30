import type { SquaddingAssignmentDto, SquaddingFindingDto } from '@/shared/ipc/contracts';

export type SquaddingStatusSectionPolicy = 'OFF' | 'END_OF_RELAY';
export type SquaddingDrawEntryType = 'APPROVED' | 'APPLIED' | 'VOID';

export interface SquaddingDrawEntryRecord {
  id: string;
  drawId: string;
  entryType: SquaddingDrawEntryType;
  officialName: string;
  statement: string;
  recordedAt: string;
}

export interface SquaddingDrawRecord {
  id: string;
  eventId: string;
  competitionTypeId: string;
  seed: string;
  algorithmVersion: string;
  relayCount: number;
  firstFiringPoint: number;
  firingPointCount: number;
  statusSectionPolicy: SquaddingStatusSectionPolicy;
  participantSnapshotJson: string;
  participantSnapshotHash: string;
  assignments: SquaddingAssignmentDto[];
  outputHash: string;
  findings: SquaddingFindingDto[];
  createdBy: string;
  createdAt: string;
  entries: SquaddingDrawEntryRecord[];
}

export interface ISquaddingRepository {
  appendDraw(draw: Omit<SquaddingDrawRecord, 'entries'>): void;
  appendEntry(entry: SquaddingDrawEntryRecord): void;
  findByEvent(eventId: string): SquaddingDrawRecord[];
  findById(id: string): SquaddingDrawRecord | null;
}
