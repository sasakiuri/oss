import { randomUUID } from 'crypto';

export class EventId {
  private constructor(public readonly value: string) {}

  static create(value?: string): EventId {
    return new EventId(value ?? randomUUID());
  }

  static generate(): EventId {
    return new EventId(randomUUID());
  }

  static reconstruct(value: string): EventId {
    return new EventId(value);
  }

  equals(other: EventId): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
