import { EventId } from './EventId';
import { ChampionshipId } from './ChampionshipId';
import { EventType } from './EventType';
import { Round } from '@/main/modules/lane-control';
import type { RulePackIdentity } from '@sasakiuri/saika-rules';

export class Event {
  private constructor(
    public readonly id: EventId,
    public readonly championshipId: ChampionshipId,
    public readonly name: string,
    public readonly eventType: EventType,
    public readonly round: Round,
    public readonly sortOrder: number,
    public readonly rulePackIdentity: RulePackIdentity | null,
  ) {}

  static create(
    id: EventId,
    championshipId: ChampionshipId,
    name: string,
    eventType: EventType,
    round: Round,
    sortOrder: number = 0,
    rulePackIdentity: RulePackIdentity | null = null,
  ): Event {
    return new Event(id, championshipId, name, eventType, round, sortOrder, copyIdentity(rulePackIdentity));
  }

  static reconstruct(
    id: EventId,
    championshipId: ChampionshipId,
    name: string,
    eventType: EventType,
    round: Round,
    sortOrder: number,
    rulePackIdentity: RulePackIdentity | null = null,
  ): Event {
    return new Event(id, championshipId, name, eventType, round, sortOrder, copyIdentity(rulePackIdentity));
  }

  update(name: string, eventType: EventType, round: Round, rulePackIdentity: RulePackIdentity | null): Event {
    return new Event(
      this.id,
      this.championshipId,
      name,
      eventType,
      round,
      this.sortOrder,
      copyIdentity(rulePackIdentity),
    );
  }
}

function copyIdentity(identity: RulePackIdentity | null): RulePackIdentity | null {
  if (!identity) return null;
  if (!/^[a-f0-9]{64}$/.test(identity.fingerprint.value)) {
    throw new Error('Rule Pack fingerprint must be a SHA-256 digest');
  }
  return Object.freeze({
    id: identity.id,
    schemaVersion: identity.schemaVersion,
    fingerprint: Object.freeze({ ...identity.fingerprint }),
  });
}
