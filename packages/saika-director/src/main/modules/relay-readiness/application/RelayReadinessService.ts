import type {
  RecordRelayReadinessPayload,
  RelayReadinessAssessmentDto,
  RelayReadinessEntryDto,
  RelayReadinessScopePayload,
} from '@/shared/ipc/contracts';

import type { IRelayReadinessRepository } from '../domain/IRelayReadinessRepository';
import type { IRelayReadinessPolicy } from '../domain/RelayReadinessPolicy';
import { IssfRelayReadinessPolicy } from '../domain/RelayReadinessPolicy';
import { RelayReadinessEntry, type RelayReadinessOperationalPhase } from '../domain/RelayReadinessEntry';

export class RelayReadinessService {
  constructor(
    private readonly repository: IRelayReadinessRepository,
    private readonly policy: IRelayReadinessPolicy = new IssfRelayReadinessPolicy(),
  ) {}

  async list(input: RelayReadinessScopePayload): Promise<RelayReadinessEntryDto[]> {
    return this.repository.findByScope(input).map(toEntryDto);
  }

  async record(input: RecordRelayReadinessPayload): Promise<RelayReadinessEntryDto> {
    const entry = RelayReadinessEntry.create({
      ...input,
      laneId: input.laneId ?? null,
      recordedAt: input.recordedAt ? new Date(input.recordedAt) : undefined,
    });
    this.repository.append(entry);
    return toEntryDto(entry);
  }

  async assess(
    input: Omit<RelayReadinessScopePayload, 'phase'> & {
      phase: RelayReadinessOperationalPhase;
      laneIds: string[];
    },
  ): Promise<RelayReadinessAssessmentDto> {
    const assessment = this.policy.assess({
      phase: input.phase,
      laneIds: input.laneIds,
      entries: this.repository.findByRelay(input),
    });
    return {
      mode: assessment.mode,
      ready: assessment.ready,
      mayStart: assessment.mayStart,
      items: assessment.items.map((item) => ({
        requirement: item.requirement,
        laneId: item.laneId,
        phase: item.phase,
        label: item.label,
        ruleReference: item.ruleReference,
        required: item.required,
        confirmed: item.confirmed,
        latestEntry: item.latestEntry ? toEntryDto(item.latestEntry) : null,
      })),
    };
  }
}

function toEntryDto(entry: RelayReadinessEntry): RelayReadinessEntryDto {
  return {
    id: entry.id,
    competitionId: entry.competitionId,
    relayNumber: entry.relayNumber,
    laneId: entry.laneId,
    phase: entry.phase,
    requirement: entry.requirement,
    state: entry.state,
    source: entry.source,
    statement: entry.statement,
    officialName: entry.officialName,
    recordedAt: entry.recordedAt.toISOString(),
  };
}
