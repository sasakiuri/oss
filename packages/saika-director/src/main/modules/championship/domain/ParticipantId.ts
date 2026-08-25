import { randomUUID } from 'crypto';

export class ParticipantId {
  private constructor(public readonly value: string) {}

  static create(value?: string): ParticipantId {
    return new ParticipantId(value ?? randomUUID());
  }

  static generate(): ParticipantId {
    return new ParticipantId(randomUUID());
  }

  static reconstruct(value: string): ParticipantId {
    return new ParticipantId(value);
  }

  equals(other: ParticipantId): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
