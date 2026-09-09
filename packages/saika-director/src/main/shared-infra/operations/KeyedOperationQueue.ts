// SPDX-License-Identifier: MIT
/** Serializes operations sharing any key, while independent resources can proceed concurrently. */
export class KeyedOperationQueue {
  private readonly tails = new Map<string, Promise<void>>();

  run<T>(keys: readonly string[], operation: () => Promise<T>): Promise<T> {
    const uniqueKeys = [...new Set(keys)];
    const predecessors = uniqueKeys.flatMap((key) => {
      const tail = this.tails.get(key);
      return tail ? [tail] : [];
    });
    const result = Promise.all(predecessors).then(operation);
    // A failed operation releases its resources without poisoning later work.
    const tail = result.then(
      () => undefined,
      () => undefined,
    );
    for (const key of uniqueKeys) this.tails.set(key, tail);
    void tail.then(() => {
      for (const key of uniqueKeys) {
        if (this.tails.get(key) === tail) this.tails.delete(key);
      }
    });
    return result;
  }
}
