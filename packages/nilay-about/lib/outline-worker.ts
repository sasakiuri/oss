/// <reference lib="webworker" />
import * as ort from 'onnxruntime-web/webgpu';

import type { OutlineRequest, OutlineResponse } from './outline-model';
import { SAM_INPUT_SIZE, SAM_MASK_SIZE, bestMaskIndex, toSamPixelValues } from './outline-segmentation';

/**
 * Runs SlimSAM off the page's main thread. The image encoder takes seconds on a phone, and on the
 * main thread it would freeze scrolling and every button for that long. The worker keeps the
 * sessions and the last photo's embeddings, so each tap after the first runs only the small decoder.
 *
 * WebGPU is used where the browser offers it, and WebAssembly on the processor otherwise; the page
 * shows which one ran.
 */

declare const self: DedicatedWorkerGlobalScope;

let encoder: ort.InferenceSession | null = null;
let decoder: ort.InferenceSession | null = null;
let embeddings: { image: ort.Tensor; positional: ort.Tensor } | null = null;

const post = (message: OutlineResponse) => self.postMessage(message);

async function createSessions(encoderModel: ArrayBuffer, decoderModel: ArrayBuffer): Promise<'webgpu' | 'wasm'> {
  if ('gpu' in navigator) {
    try {
      encoder = await ort.InferenceSession.create(new Uint8Array(encoderModel), { executionProviders: ['webgpu'] });
      decoder = await ort.InferenceSession.create(new Uint8Array(decoderModel), { executionProviders: ['webgpu'] });
      return 'webgpu';
    } catch {
      // No usable adapter, or an operator the GPU backend lacks: the processor runs it instead,
      // and the page says so.
      encoder = null;
      decoder = null;
    }
  }
  encoder = await ort.InferenceSession.create(new Uint8Array(encoderModel), { executionProviders: ['wasm'] });
  decoder = await ort.InferenceSession.create(new Uint8Array(decoderModel), { executionProviders: ['wasm'] });
  return 'wasm';
}

self.onmessage = async (event: MessageEvent<OutlineRequest>) => {
  const request = event.data;
  try {
    if (request.type === 'load') {
      const backend = await createSessions(request.encoder, request.decoder);
      post({ type: 'loaded', backend });
      return;
    }
    if (!encoder || !decoder) throw new Error('The model is not loaded.');
    if (request.type === 'encode') {
      embeddings = null;
      const pixels = toSamPixelValues(new Uint8ClampedArray(request.rgba), request.width, request.height);
      const output = await encoder.run({
        pixel_values: new ort.Tensor('float32', pixels, [1, 3, SAM_INPUT_SIZE, SAM_INPUT_SIZE]),
      });
      embeddings = { image: output.image_embeddings!, positional: output.image_positional_embeddings! };
      post({ type: 'encoded', id: request.id });
      return;
    }
    if (!embeddings) throw new Error('The photo has not been read by the model.');
    const count = request.points.length;
    const output = await decoder.run({
      input_points: new ort.Tensor(
        'float32',
        Float32Array.from(request.points.flatMap((point) => [point.x, point.y])),
        [1, 1, count, 2],
      ),
      input_labels: new ort.Tensor(
        'int64',
        BigInt64Array.from(request.points.map((point) => BigInt(point.foreground ? 1 : 0))),
        [1, 1, count],
      ),
      image_embeddings: embeddings.image,
      image_positional_embeddings: embeddings.positional,
    });
    const scores = output.iou_scores!.data as Float32Array;
    const best = bestMaskIndex(scores);
    const plane = SAM_MASK_SIZE * SAM_MASK_SIZE;
    const logits = (output.pred_masks!.data as Float32Array).slice(best * plane, (best + 1) * plane);
    self.postMessage({ type: 'mask', id: request.id, logits, score: scores[best]! } satisfies OutlineResponse, [
      logits.buffer,
    ]);
  } catch (error) {
    post({
      type: 'error',
      id: 'id' in request ? request.id : null,
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
