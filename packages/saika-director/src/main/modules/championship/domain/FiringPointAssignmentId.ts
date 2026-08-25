import { randomUUID } from 'crypto';

export class FiringPointAssignmentId {
  private constructor(public readonly value: string) {}

  static create(value?: string): FiringPointAssignmentId {
    return new FiringPointAssignmentId(value ?? randomUUID());
  }

  static generate(): FiringPointAssignmentId {
    return new FiringPointAssignmentId(randomUUID());
  }

  equals(other: FiringPointAssignmentId): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
