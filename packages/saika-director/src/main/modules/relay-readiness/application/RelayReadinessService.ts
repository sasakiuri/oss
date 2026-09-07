import type {
  CompetitionStartScope,
  CompetitionStartIssue,
  ICompetitionStartReadinessSource,
} from '@/main/shared-infra/operations/CompetitionStartReadiness';
import type {
  RecordRelayReadinessPayload,
  RelayReadinessAssessmentDto,
  RelayReadinessEntryDto,
  RelayReadinessScopePayload,
} from '@/shared/ipc/contracts';

import type { IRelayReadinessRepository } from '../domain/IRelayReadinessRepository';
import type { IRelayStartSettingsRepository, RelayStartSettings } from '../domain/IRelayStartSettingsRepository';
import { RelayReadinessEntry, type RelayReadinessOperationalPhase } from '../domain/RelayReadinessEntry';
import type { IRelayReadinessPolicy, RelayReadinessMode } from '../domain/RelayReadinessPolicy';
import { IssfRelayReadinessPolicy } from '../domain/RelayReadinessPolicy';

export class RelayReadinessService implements ICompetitionStartReadinessSource {
  constructor(
    private readonly repository: IRelayReadinessRepository,
    private readonly policy: IRelayReadinessPolicy | ((mode: RelayReadinessMode) => IRelayReadinessPolicy) = (mode) =>
      new IssfRelayReadinessPolicy(mode),
    private readonly startSettings?: IRelayStartSettingsRepository,
  ) {}

  getStartSettings(competitionId: string): RelayStartSettings {
    return this.startSettings?.find(competitionId) ?? { competitionId, relayNumber: 1, mode: 'ADVISORY' };
  }

  setStartSettings(settings: RelayStartSettings): RelayStartSettings {
    if (!this.startSettings) throw new Error('Relay start settings are not configured');
    this.startSettings.save(settings);
    return this.getStartSettings(settings.competitionId);
  }

  getStartIssues(scope: CompetitionStartScope): readonly CompetitionStartIssue[] {
    const settings = this.getStartSettings(scope.competitionId);
    const assessment = this.assessment({ ...scope, laneIds: [...scope.laneIds], relayNumber: settings.relayNumber });
    return assessment.items
      .filter((item) => item.required && !item.confirmed)
      .map((item) => ({
        code: `RELAY_${item.requirement}`,
        message: `Relay ${settings.relayNumber}: ${item.label}${item.laneId ? ` (${item.laneId})` : ''}`,
        blocking: !assessment.mayStart,
      }));
  }

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
    return this.assessment(input);
  }

  private assessment(input: {
    competitionId: string;
    relayNumber: number;
    phase: RelayReadinessOperationalPhase;
    laneIds: string[];
  }): RelayReadinessAssessmentDto {
    const policy =
      typeof this.policy === 'function' ? this.policy(this.getStartSettings(input.competitionId).mode) : this.policy;
    const assessment = policy.assess({
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
