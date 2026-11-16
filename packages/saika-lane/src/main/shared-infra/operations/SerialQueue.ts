// SPDX-License-Identifier: MIT
/**
 * Runs operations one at a time in call order. A failed operation rejects only
 * the promise returned to its caller; later operations still run.
 */
export class SerialQueue {
  private tail: Promise<void> = Promise.resolve();

  run<T>(operation: () => T | PromiseLike<T>): Promise<T> {
    const result = this.tail.then(() => operation());
    this.tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}
