export function addWithLimit<T>(array: readonly T[], item: T, maxSize: number): T[] {
  return [...array, item].slice(-maxSize);
}

export function addManyWithLimit<T>(array: readonly T[], items: T[], maxSize: number): T[] {
  return [...array, ...items].slice(-maxSize);
}
