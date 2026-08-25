export class Checksum {
  private constructor(public readonly value: string) {}

  static calculate(data: string): Checksum {
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      sum += data.charCodeAt(i);
    }
    const hex = (sum & 0xff).toString(16).toUpperCase().padStart(2, '0');
    return new Checksum(hex);
  }

  static fromHex(hex: string): Checksum {
    return new Checksum(hex.toUpperCase());
  }

  verify(data: string): boolean {
    const calculated = Checksum.calculate(data);
    return calculated.value === this.value;
  }

  toString(): string {
    return this.value;
  }

  equals(other: Checksum): boolean {
    return this.value === other.value;
  }
}
