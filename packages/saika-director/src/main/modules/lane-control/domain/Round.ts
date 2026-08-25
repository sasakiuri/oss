export const ROUNDS = ['Elimination', 'Qualification', 'Final', 'Individual'] as const;
export type RoundValue = (typeof ROUNDS)[number];

export class Round {
  private constructor(public readonly value: RoundValue) {}

  static create(value: string): Round {
    if (!ROUNDS.includes(value as RoundValue)) {
      throw new Error(`Invalid round: ${value}. Must be one of: ${ROUNDS.join(', ')}`);
    }
    return new Round(value as RoundValue);
  }

  equals(other: Round): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
