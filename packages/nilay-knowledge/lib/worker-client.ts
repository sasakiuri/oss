import { type Remote, releaseProxy, wrap } from 'comlink';

/** Comlink handles RPC; this boundary owns termination and rejects interrupted calls. */
export function createWorkerClient<T>(worker: Worker, stoppedMessage: string) {
  const lifetime = new AbortController();
  const { signal } = lifetime;
  const remote = wrap<T>({
    postMessage: worker.postMessage.bind(worker),
    addEventListener: (type, listener) => worker.addEventListener(type, listener, { signal }),
    removeEventListener: worker.removeEventListener.bind(worker),
  });

  function dispose(reason = new Error(stoppedMessage)) {
    if (signal.aborted) return;
    remote[releaseProxy]();
    lifetime.abort(reason);
    worker.terminate();
  }

  worker.addEventListener('error', () => dispose(), { signal });
  worker.addEventListener('messageerror', () => dispose(), { signal });

  return {
    async call<R>(invoke: (api: Remote<T>) => Promise<R>): Promise<R> {
      signal.throwIfAborted();
      let onStop!: () => void;
      const stopped = new Promise<never>((_resolve, reject) => {
        onStop = () => reject(signal.reason);
        signal.addEventListener('abort', onStop, { once: true });
      });
      try {
        return await Promise.race([invoke(remote), stopped]);
      } finally {
        signal.removeEventListener('abort', onStop);
      }
    },
    dispose,
  };
}
