export class DiffCalculator<T extends Record<string, unknown>> {
  private previousStates = new Map<string, T>();

  calculateDiff(id: string, current: T): { isInitial: boolean; patch: Partial<T> } {
    const previous = this.previousStates.get(id);
    this.previousStates.set(id, this.deepClone(current));

    if (!previous) {
      return { isInitial: true, patch: current };
    }

    const patch: Partial<T> = {};
    for (const key of Object.keys(current) as Array<keyof T>) {
      if (!this.isEqual(previous[key], current[key])) {
        patch[key] = current[key] as T[keyof T];
      }
    }

    return { isInitial: false, patch };
  }

  clear(id: string): void {
    this.previousStates.delete(id);
  }

  clearAll(): void {
    this.previousStates.clear();
  }

  private isEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (a === null || b === null) return a === b;
    if (typeof a !== typeof b) return false;

    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return false;
      return a.every((val, idx) => this.isEqual(val, b[idx]));
    }

    if (typeof a === 'object' && typeof b === 'object') {
      const objA = a as Record<string, unknown>;
      const objB = b as Record<string, unknown>;
      const keysA = Object.keys(objA);
      const keysB = Object.keys(objB);
      if (keysA.length !== keysB.length) return false;
      return keysA.every((key) => this.isEqual(objA[key], objB[key]));
    }

    return false;
  }

  private deepClone(obj: T): T {
    const clone: Record<string, unknown> = {};
    for (const key of Object.keys(obj)) {
      const value = obj[key];
      if (Array.isArray(value)) {
        clone[key] = [...value];
      } else if (value !== null && typeof value === 'object') {
        clone[key] = this.deepClone(value as T);
      } else {
        clone[key] = value;
      }
    }
    return clone as T;
  }
}
