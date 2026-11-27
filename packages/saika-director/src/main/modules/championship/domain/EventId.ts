import { randomUUID } from 'crypto';

export class EventId {
  private constructor(public readonly value: string) {}

  static create(value: string): EventId {
    return new EventId(value);
  }

  static generate(): EventId {
    return new EventId(randomUUID());
  }

  equals(other: EventId): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
