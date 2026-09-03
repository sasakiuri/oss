import type {
  RecordRelayAthleteLifecyclePayload,
  RelayAthleteLifecycleAssessmentDto,
  RelayAthleteLifecycleEntryDto,
  RelayAthleteLifecycleScopePayload,
} from '@/shared/ipc/contracts';

import type { IRelayAthleteLifecycleRepository } from '../domain/IRelayAthleteLifecycleRepository';
import { RelayAthleteLifecycleEntry } from '../domain/RelayAthleteLifecycleEntry';
import type { IRelayAthleteLifecyclePolicy } from '../domain/RelayAthleteLifecyclePolicy';
import { athleteMayBeReleased, IssfRelayAthleteLifecyclePolicy } from '../domain/RelayAthleteLifecyclePolicy';

export class RelayAthleteLifecycleService {
  constructor(
    private readonly repository: IRelayAthleteLifecycleRepository,
    private readonly policy: IRelayAthleteLifecyclePolicy = new IssfRelayAthleteLifecyclePolicy(),
  ) {}

  async list(input: RelayAthleteLifecycleScopePayload): Promise<RelayAthleteLifecycleEntryDto[]> {
    return this.repository.findByScope(input).map(toEntryDto);
  }

  async record(input: RecordRelayAthleteLifecyclePayload): Promise<RelayAthleteLifecycleEntryDto> {
    if (input.requirement === 'ATHLETE_RELEASED' && input.state === 'CONFIRMED') {
      const assessment = this.policy.assess({
        phase: 'POST_RELAY',
        athletes: [input],
        entries: this.repository.findByRelay(input),
      });
      if (assessment.mode === 'REQUIRED' && !athleteMayBeReleased(assessment.items, input.athleteId)) {
        throw new Error('Athlete release requires firearm clearance and an identified score printout');
      }
    }

    const entry = RelayAthleteLifecycleEntry.create({
      ...input,
      recordedAt: input.recordedAt ? new Date(input.recordedAt) : undefined,
    });
    this.repository.append(entry);
    return toEntryDto(entry);
  }

  async assess(
    input: RelayAthleteLifecycleScopePayload & {
      athletes: Array<{ laneId: string; athleteId: string; athleteName: string; athleteStartNumber: number }>;
    },
  ): Promise<RelayAthleteLifecycleAssessmentDto> {
    const assessment = this.policy.assess({
      phase: input.phase,
      athletes: input.athletes,
      entries: this.repository.findByRelay(input),
    });
    return {
      ...assessment,
      items: assessment.items.map((item) => ({
        ...item,
        latestEntry: item.latestEntry ? toEntryDto(item.latestEntry) : null,
      })),
    };
  }
}

function toEntryDto(entry: RelayAthleteLifecycleEntry): RelayAthleteLifecycleEntryDto {
  return {
    id: entry.id,
    competitionId: entry.competitionId,
    relayNumber: entry.relayNumber,
    laneId: entry.laneId,
    athleteId: entry.athleteId,
    athleteName: entry.athleteName,
    athleteStartNumber: entry.athleteStartNumber,
    phase: entry.phase,
    requirement: entry.requirement,
    state: entry.state,
    source: entry.source,
    statement: entry.statement,
    officialName: entry.officialName,
    recordedAt: entry.recordedAt.toISOString(),
  };
}
