export class ShotNumber {
  private constructor(public readonly value: number) {}

  static create(value: number): ShotNumber {
    if (!Number.isInteger(value) || value < 1) {
      throw new Error(`Invalid shot number: ${value}`);
    }
    return new ShotNumber(value);
  }

  seriesNumber(shotsPerSeries: number = 10): number {
    return Math.ceil(this.value / shotsPerSeries);
  }

  positionInSeries(shotsPerSeries: number = 10): number {
    const pos = this.value % shotsPerSeries;
    return pos === 0 ? shotsPerSeries : pos;
  }

  equals(other: ShotNumber): boolean {
    return this.value === other.value;
  }

  isGreaterThan(other: ShotNumber): boolean {
    return this.value > other.value;
  }
}
