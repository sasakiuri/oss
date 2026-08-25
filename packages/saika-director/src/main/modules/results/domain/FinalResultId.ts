import { randomUUID } from 'crypto';

export class FinalResultId {
  private constructor(public readonly value: string) {}

  static create(value?: string): FinalResultId {
    return new FinalResultId(value ?? randomUUID());
  }

  static generate(): FinalResultId {
    return new FinalResultId(randomUUID());
  }

  equals(other: FinalResultId): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
