export interface IRankable<T extends IRankable<T>> {
  compareTo(other: T): number;
  compareEqualForDisplay?(other: T): number;
}
