import { randomUUID } from 'crypto';

export class ShootoffId {
  private constructor(public readonly value: string) {}

  static create(value?: string): ShootoffId {
    return new ShootoffId(value ?? randomUUID());
  }

  static generate(): ShootoffId {
    return new ShootoffId(randomUUID());
  }

  equals(other: ShootoffId): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
