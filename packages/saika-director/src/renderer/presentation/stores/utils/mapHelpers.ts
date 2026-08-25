export function createMapFromArray<T, K = string>(
  items: T[],
  keyFn: (item: T) => K = (item: T) => (item as { id: K }).id,
): Map<K, T> {
  const map = new Map<K, T>();
  items.forEach((item) => map.set(keyFn(item), item));
  return map;
}

export function setInMap<K, V>(map: Map<K, V>, key: K, value: V): Map<K, V> {
  const newMap = new Map(map);
  newMap.set(key, value);
  return newMap;
}

export function patchInMap<K, V extends object>(
  map: Map<K, V>,
  key: K,
  patch: Partial<V>,
): { success: boolean; map: Map<K, V>; previous: V | undefined } {
  const existing = map.get(key);
  if (!existing) {
    return { success: false, map, previous: undefined };
  }
  const newMap = new Map(map);
  newMap.set(key, { ...existing, ...patch });
  return { success: true, map: newMap, previous: existing };
}

export function deleteFromMap<K, V>(map: Map<K, V>, key: K): Map<K, V> {
  const newMap = new Map(map);
  newMap.delete(key);
  return newMap;
}

export function clearMap<K, V>(): Map<K, V> {
  return new Map();
}

export function mapToArray<K, V>(map: Map<K, V>): V[] {
  return Array.from(map.values());
}

export function toggleInSet<T>(set: Set<T>, id: T): Set<T> {
  const newSet = new Set(set);
  if (newSet.has(id)) {
    newSet.delete(id);
  } else {
    newSet.add(id);
  }
  return newSet;
}

export function selectAllFromMap<K, V>(map: Map<K, V>): Set<K> {
  return new Set(map.keys());
}

export function clearSelection<T>(): Set<T> {
  return new Set();
}

export function addWithLimit<T>(array: readonly T[], item: T, maxSize: number): T[] {
  return [...array, item].slice(-maxSize);
}

export function addManyWithLimit<T>(array: readonly T[], items: T[], maxSize: number): T[] {
  return [...array, ...items].slice(-maxSize);
}

export interface PatchResult {
  applied: boolean;
  needsFullSync: boolean;
}

export function createPatchResult(applied: boolean, needsFullSync: boolean = false): PatchResult {
  return { applied, needsFullSync };
}
