/** The page's side of the SpeciesNet worker (`species-worker.ts`). */

export type SpeciesRequest = { type: 'load'; model: ArrayBuffer } | { type: 'classify'; id: number; photo: Blob };

export interface SpeciesGuess {
  /** The line of the labels file. */
  index: number;
  /** 0 to 1. */
  score: number;
}

export type SpeciesResponse =
  | { type: 'loaded'; backend: 'webgpu' | 'wasm' }
  | { type: 'classified'; id: number; top: SpeciesGuess[] }
  | { type: 'error'; id: number | null; message: string };

/** One worker, one model, one photo at a time. */
export class SpeciesClassifier {
  private readonly worker: Worker;
  private next = 1;
  private readonly waiting = new Map<number | 'load', (response: SpeciesResponse) => void>();
  private closed = false;

  constructor() {
    this.worker = new Worker(new URL('./species-worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (event: MessageEvent<SpeciesResponse>) => {
      const response = event.data;
      const key = response.type === 'loaded' || response.id === null ? 'load' : response.id;
      const resolve = this.waiting.get(key);
      this.waiting.delete(key);
      resolve?.(response);
    };
    // A worker that fails to start or crashes answers nothing, so every question waiting on it fails.
    // A crashed worker is not asked again: every later question fails at once instead of waiting.
    this.worker.onerror = () => {
      this.closed = true;
      this.worker.terminate();
      this.settleAll('The worker failed.');
    };
  }

  private settleAll(message: string) {
    for (const resolve of this.waiting.values()) resolve({ type: 'error', id: null, message });
    this.waiting.clear();
  }

  private ask(key: number | 'load', request: SpeciesRequest, transfer: Transferable[] = []): Promise<SpeciesResponse> {
    // A closed worker answers nothing, so a question put to it after closing fails at once.
    if (this.closed) return Promise.resolve({ type: 'error', id: null, message: 'The model was closed.' });
    return new Promise((resolve) => {
      this.waiting.set(key, resolve);
      this.worker.postMessage(request, transfer);
    });
  }

  async load(model: ArrayBuffer): Promise<'webgpu' | 'wasm'> {
    const response = await this.ask('load', { type: 'load', model }, [model]);
    if (response.type !== 'loaded') throw new Error(response.type === 'error' ? response.message : 'Unexpected reply');
    return response.backend;
  }

  async classify(photo: Blob): Promise<SpeciesGuess[]> {
    const id = this.next++;
    const response = await this.ask(id, { type: 'classify', id, photo });
    if (response.type !== 'classified')
      throw new Error(response.type === 'error' ? response.message : 'Unexpected reply');
    return response.top;
  }

  dispose(): void {
    this.closed = true;
    this.worker.terminate();
    this.settleAll('The model was closed.');
  }
}
