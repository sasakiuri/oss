import type {
  StartListDisciplineGroupDto,
  StartListDistributionChannelDto,
  StartListDistributionModeDto,
  StartListFinalReleaseBasisDto,
  StartListFindingDto,
  StartListKindDto,
  StartListOfficialRoleDto,
  StartListRowDto,
} from '@/shared/ipc/contracts';

export type StartListEntryType = 'CONTENT_APPROVED' | 'PAPERLESS_APPROVED' | 'DISTRIBUTED' | 'VOID' | 'WITHDRAWN';

export interface StartListEntryRecord {
  id: string;
  versionId: string;
  type: StartListEntryType;
  officialName: string;
  officialRole: StartListOfficialRoleDto;
  statement: string;
  channels: StartListDistributionChannelDto[];
  finalReleaseBasis: StartListFinalReleaseBasisDto | null;
  recordedAt: string;
}

export interface StartListSnapshot {
  eventName: string;
  competitionTypeId: string;
  rows: StartListRowDto[];
}

export interface StartListVersionRecord {
  id: string;
  eventId: string;
  versionNumber: number;
  listKind: StartListKindDto;
  disciplineGroup: StartListDisciplineGroupDto;
  distributionMode: StartListDistributionModeDto;
  scheduledStartAt: string;
  publicationDueAt: string;
  sourceSnapshotJson: string;
  sourceHash: string;
  snapshot: StartListSnapshot;
  findings: StartListFindingDto[];
  createdBy: string;
  createdAt: string;
  entries: StartListEntryRecord[];
}

export interface IStartListRepository {
  appendVersion(value: Omit<StartListVersionRecord, 'entries'>): void;
  appendEntry(value: StartListEntryRecord): void;
  findByEvent(eventId: string): StartListVersionRecord[];
  findById(id: string): StartListVersionRecord | null;
  nextVersionNumber(eventId: string, listKind: StartListKindDto): number;
}
