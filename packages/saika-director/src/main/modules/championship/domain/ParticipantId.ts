import { randomUUID } from 'crypto';

export class ParticipantId {
  private constructor(public readonly value: string) {}

  static create(value: string): ParticipantId {
    return new ParticipantId(value);
  }

  static generate(): ParticipantId {
    return new ParticipantId(randomUUID());
  }

  equals(other: ParticipantId): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
