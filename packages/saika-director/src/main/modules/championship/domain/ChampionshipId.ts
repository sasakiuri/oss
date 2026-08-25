import { randomUUID } from 'crypto';

export class ChampionshipId {
  private constructor(public readonly value: string) {}

  static create(value?: string): ChampionshipId {
    return new ChampionshipId(value ?? randomUUID());
  }

  static generate(): ChampionshipId {
    return new ChampionshipId(randomUUID());
  }

  equals(other: ChampionshipId): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
