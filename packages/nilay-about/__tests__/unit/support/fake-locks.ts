/**
 * The Web Locks API as a browser has it, for one tab's worth of tests: shared and exclusive modes,
 * `ifAvailable`, requests granted in the order they were made, and a lock held until its callback's
 * promise settles. jsdom has none. `holdShared` and `holdExclusive` stand in for other tabs.
 */

type Mode = 'shared' | 'exclusive';
type Callback = (lock: { name: string; mode: Mode } | null) => unknown;

interface Request {
  name: string;
  mode: Mode;
  grant: () => void;
}

export class FakeLockManager {
  private held: { name: string; mode: Mode }[] = [];
  private queue: Request[] = [];

  private compatible(name: string, mode: Mode) {
    const holders = this.held.filter((lock) => lock.name === name);
    return holders.length === 0 || (mode === 'shared' && holders.every((lock) => lock.mode === 'shared'));
  }

  private pump() {
    for (const request of [...this.queue]) {
      // Granted in order: a request waits behind an earlier one for the same name.
      const earlier = this.queue.slice(0, this.queue.indexOf(request)).some((other) => other.name === request.name);
      if (earlier || !this.compatible(request.name, request.mode)) continue;
      this.queue.splice(this.queue.indexOf(request), 1);
      request.grant();
    }
  }

  request(
    name: string,
    optionsOrCallback: { mode?: Mode; ifAvailable?: boolean; signal?: AbortSignal } | Callback,
    maybe?: Callback,
  ) {
    const options = typeof optionsOrCallback === 'function' ? {} : optionsOrCallback;
    const callback = typeof optionsOrCallback === 'function' ? optionsOrCallback : maybe!;
    const mode = options.mode ?? 'exclusive';
    if (options.ifAvailable && (!this.compatible(name, mode) || this.queue.some((request) => request.name === name)))
      return Promise.resolve(callback(null));
    return new Promise((resolve, reject) => {
      const grant = () => {
        const lock = { name, mode };
        this.held.push(lock);
        Promise.resolve()
          .then(() => callback(lock))
          .then(resolve, reject)
          .finally(() => {
            this.held.splice(this.held.indexOf(lock), 1);
            this.pump();
          });
      };
      const request = { name, mode, grant };
      // A request still waiting is withdrawn when its signal aborts, as the browser does.
      const signal = options.signal;
      if (signal?.aborted) {
        reject(new DOMException('Aborted', 'AbortError'));
        return;
      }
      signal?.addEventListener('abort', () => {
        const index = this.queue.indexOf(request);
        if (index === -1) return;
        this.queue.splice(index, 1);
        reject(new DOMException('Aborted', 'AbortError'));
      });
      this.queue.push(request);
      this.pump();
    });
  }

  /** Another tab holding the lock in this mode until the returned function is called. */
  hold(name: string, mode: Mode): () => void {
    let release: () => void = () => undefined;
    void this.request(name, { mode }, () => new Promise<void>((done) => (release = done)));
    return () => release();
  }

  holders(name: string) {
    return this.held.filter((lock) => lock.name === name).map((lock) => lock.mode);
  }
}

export function installFakeLocks(): FakeLockManager {
  const manager = new FakeLockManager();
  Object.defineProperty(navigator, 'locks', { value: manager, configurable: true });
  return manager;
}
