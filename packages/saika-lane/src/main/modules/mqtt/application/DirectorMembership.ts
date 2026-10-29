// SPDX-License-Identifier: MIT
import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';
import type { DirectorMembershipDto } from '@/shared/ipc/contracts';
import type { ILocalStorage } from '@/shared/storage/ILocalStorage';

/** Owns durable Director membership independently of the transport connection. */
export class DirectorMembership {
  private revision = 0;

  constructor(
    private readonly storage: ILocalStorage,
    private readonly eventBus: IEventBus,
  ) {}

  get snapshot(): DirectorMembershipDto {
    return {
      competitionId: this.storage.get<string>('mqtt.competitionId') ?? null,
      revision: this.revision,
    };
  }

  setCompetitionId(competitionId: string | null): void {
    if (this.snapshot.competitionId === competitionId) return;
    if (competitionId === null) this.storage.delete('mqtt.competitionId');
    else this.storage.set('mqtt.competitionId', competitionId);
    this.revision += 1;
    this.eventBus.emit({
      type: 'DirectorMembershipChanged',
      timestamp: Date.now(),
      aggregateId: competitionId ?? '',
      ...this.snapshot,
    });
  }
}
