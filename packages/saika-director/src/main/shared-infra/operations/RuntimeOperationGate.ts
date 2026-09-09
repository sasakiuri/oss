// SPDX-License-Identifier: MIT
/** Allows concurrent control operations between exclusive runtime transitions. */
export class RuntimeOperationGate {
  private transitionTail = Promise.resolve();
  private readonly activeControls = new Set<Promise<void>>();

  readonly runTransition = <T>(operation: () => Promise<T>): Promise<T> => {
    // Later controls wait for this transition. Waiting for them here would
    // deadlock, so capture only controls submitted before the transition.
    const precedingControls = [...this.activeControls];
    const result = this.transitionTail.then(async () => {
      await Promise.all(precedingControls);
      return operation();
    });
    this.transitionTail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };

  readonly runControl = <T>(operation: () => Promise<T>): Promise<T> => {
    const result = this.transitionTail.then(operation);
    const tail = result.then(
      () => undefined,
      () => undefined,
    );
    this.activeControls.add(tail);
    void tail.then(() => this.activeControls.delete(tail));
    return result;
  };
}
