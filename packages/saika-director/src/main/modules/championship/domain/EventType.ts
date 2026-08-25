import type { CompetitionTypeRegistry } from '@/shared/competitionTypes';

export class EventType {
  private constructor(public readonly value: string) {}

  static create(value: string, registry: CompetitionTypeRegistry): EventType {
    if (!registry.has(value)) {
      const validTypes = registry
        .getAll()
        .map((d) => d.id)
        .join(', ');
      throw new Error(`Invalid event type: ${value}. Must be one of: ${validTypes}`);
    }
    return new EventType(value);
  }

  equals(other: EventType): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
