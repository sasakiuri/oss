import type { ModelFile } from './model-download';
import { samFit, maskAtFit, type SamFit } from './outline-segmentation';

/**
 * The outline model as the page sees it: which files it is made of, and a small client for the
 * worker that runs it. The photo is drawn onto a canvas here and handed to the worker as pixels;
 * it never goes anywhere else.
 *
 * SlimSAM-77 (Chen et al., "SlimSAM: 0.1% Data Makes Segment Anything Slim", arXiv:2312.05284),
 * a pruned Segment Anything (Kirillov et al., arXiv:2304.02643), in the 8-bit ONNX export
 * published as Xenova/slimsam-77-uniform at revision 5850ab45f587c112167512ffef949107115e26a0.
 * Apache License 2.0. The unmodified files are fetched from Hugging Face at that revision, so the
 * bytes cannot change, and are checked against the hashes recorded here before they run. Fetching
 * them is the only request the tool makes to another site; the photo never leaves the page.
 */
const OUTLINE_MODEL_BASE = `https://huggingface.co/Xenova/slimsam-77-uniform/resolve/5850ab45f587c112167512ffef949107115e26a0/onnx`;

export const OUTLINE_MODEL_FILES = {
  encoder: {
    url: `${OUTLINE_MODEL_BASE}/vision_encoder_quantized.onnx`,
    sha256: 'cce23c7b2e5d4f330932738fb67ba518e04b0d99ccdd1cccd22a7da4e01f2971',
    bytes: 8_882_165,
  },
  decoder: {
    url: `${OUTLINE_MODEL_BASE}/prompt_encoder_mask_decoder_quantized.onnx`,
    sha256: 'cb90b279f549d2cab7fd6e20c38522438c65d84bdcca3d2a764cff7d857fdce2',
    bytes: 4_903_810,
  },
} as const satisfies Record<string, ModelFile>;

export const OUTLINE_MODEL_BYTES = OUTLINE_MODEL_FILES.encoder.bytes + OUTLINE_MODEL_FILES.decoder.bytes;

/**
 * The WebAssembly runtime the worker loads with it: `ort-wasm-simd-threaded.asyncify.wasm` of
 * onnxruntime-web 1.30.0, which the build serves from this site. It is part of what the reader is
 * asked to download, so it is counted in the size shown; update it with the package.
 */
export const OUTLINE_RUNTIME_BYTES = 26_781_914;

export interface PromptPoint {
  /** Model pixels, that is photo pixels times the fit's scale. */
  x: number;
  y: number;
  /** True for a tap on the animal, false for a tap on what should be left out. */
  foreground: boolean;
}

export type OutlineRequest =
  | { type: 'load'; encoder: ArrayBuffer; decoder: ArrayBuffer }
  | { type: 'encode'; id: number; rgba: ArrayBuffer; width: number; height: number }
  | { type: 'segment'; id: number; points: PromptPoint[] };

export type OutlineResponse =
  | { type: 'loaded'; backend: 'webgpu' | 'wasm' }
  | { type: 'encoded'; id: number }
  | { type: 'mask'; id: number; logits: Float32Array; score: number }
  | { type: 'error'; id: number | null; message: string };

export interface Outline {
  /** 1 inside the outline, at the fitted size. */
  mask: Uint8Array;
  fit: SamFit;
  /** The model's own estimate of how well the mask fits, 0 to 1. */
  score: number;
}

/** One worker, one model, one photo at a time. */
export class OutlineModel {
  private readonly worker: Worker;
  private next = 1;
  private fit: SamFit | null = null;
  private readonly waiting = new Map<number | 'load', (response: OutlineResponse) => void>();

  constructor() {
    this.worker = new Worker(new URL('./outline-worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (event: MessageEvent<OutlineResponse>) => {
      const response = event.data;
      const key = response.type === 'loaded' ? 'load' : response.id === null ? 'load' : response.id;
      const resolve = this.waiting.get(key);
      this.waiting.delete(key);
      resolve?.(response);
    };
    // A worker that fails to start or crashes answers nothing, so every question waiting on it fails.
    this.worker.onerror = () => {
      for (const resolve of this.waiting.values()) resolve({ type: 'error', id: null, message: 'The worker failed.' });
      this.waiting.clear();
    };
  }

  private ask(key: number | 'load', request: OutlineRequest, transfer: Transferable[] = []): Promise<OutlineResponse> {
    return new Promise((resolve) => {
      this.waiting.set(key, resolve);
      this.worker.postMessage(request, transfer);
    });
  }

  async load(encoder: ArrayBuffer, decoder: ArrayBuffer): Promise<'webgpu' | 'wasm'> {
    const response = await this.ask('load', { type: 'load', encoder, decoder }, [encoder, decoder]);
    if (response.type !== 'loaded') throw new Error(response.type === 'error' ? response.message : 'Unexpected reply');
    return response.backend;
  }

  /** Reads the photo once; the taps that follow reuse it. Returns false where the pixels cannot be read. */
  async setPhoto(image: HTMLImageElement): Promise<boolean> {
    const fit = samFit(image.naturalWidth, image.naturalHeight);
    if (!fit) return false;
    const canvas = document.createElement('canvas');
    canvas.width = fit.width;
    canvas.height = fit.height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return false;
    let rgba: Uint8ClampedArray;
    try {
      context.drawImage(image, 0, 0, fit.width, fit.height);
      rgba = context.getImageData(0, 0, fit.width, fit.height).data;
    } catch {
      return false;
    }
    const id = this.next++;
    const response = await this.ask(
      id,
      { type: 'encode', id, rgba: rgba.buffer as ArrayBuffer, width: fit.width, height: fit.height },
      [rgba.buffer],
    );
    if (response.type !== 'encoded') throw new Error(response.type === 'error' ? response.message : 'Unexpected reply');
    this.fit = fit;
    return true;
  }

  /** The outline around the taps, which are given in photo pixels. */
  async outline(points: readonly { x: number; y: number; foreground: boolean }[]): Promise<Outline> {
    const fit = this.fit;
    if (!fit) throw new Error('No photo has been read.');
    const id = this.next++;
    const response = await this.ask(id, {
      type: 'segment',
      id,
      points: points.map((point) => ({ x: point.x * fit.scale, y: point.y * fit.scale, foreground: point.foreground })),
    });
    if (response.type !== 'mask') throw new Error(response.type === 'error' ? response.message : 'Unexpected reply');
    return { mask: maskAtFit(response.logits, fit), fit, score: response.score };
  }

  dispose(): void {
    this.worker.terminate();
    for (const resolve of this.waiting.values()) resolve({ type: 'error', id: null, message: 'The model was closed.' });
    this.waiting.clear();
  }
}
