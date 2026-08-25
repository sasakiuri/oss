import { randomUUID } from 'crypto';

export class ResultId {
  private constructor(public readonly value: string) {}

  static create(value?: string): ResultId {
    return new ResultId(value ?? randomUUID());
  }

  static generate(): ResultId {
    return new ResultId(randomUUID());
  }

  static reconstruct(value: string): ResultId {
    return new ResultId(value);
  }

  equals(other: ResultId): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
