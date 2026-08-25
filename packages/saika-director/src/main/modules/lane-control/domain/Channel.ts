import { DomainError, ErrorCatalog } from '@/shared/errors';
import { PROTOCOL } from '@/shared/constants';

export class Channel {
  private constructor(public readonly value: number) {}

  static create(value: number, maxChannel: number = PROTOCOL.CHANNEL.ABSOLUTE_MAX): Channel {
    if (!Number.isInteger(value) || value < PROTOCOL.CHANNEL.MIN || value > maxChannel) {
      throw DomainError.from(ErrorCatalog.CHANNEL.OUT_OF_RANGE);
    }
    return new Channel(value);
  }

  toString(): string {
    return String(this.value).padStart(2, '0');
  }

  equals(other: Channel): boolean {
    return this.value === other.value;
  }
}
