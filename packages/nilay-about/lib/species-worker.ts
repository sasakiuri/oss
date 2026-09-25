/// <reference lib="webworker" />
import * as ort from 'onnxruntime-web/webgpu';

import type { SpeciesRequest, SpeciesResponse } from './species-classifier';
import { SPECIES_INPUT_SIZE, speciesCrop } from './species-model';

/**
 * Runs SpeciesNet off the page's main thread, one photo at a time. The photo arrives as the file the
 * reader chose; it is decoded, cropped and scaled here and never leaves the worker.
 */

declare const self: DedicatedWorkerGlobalScope;

let session: ort.InferenceSession | null = null;

const post = (message: SpeciesResponse) => self.postMessage(message);

async function createSession(model: ArrayBuffer): Promise<'webgpu' | 'wasm'> {
  if ('gpu' in navigator) {
    try {
      session = await ort.InferenceSession.create(new Uint8Array(model), { executionProviders: ['webgpu'] });
      return 'webgpu';
    } catch {
      // No usable adapter, or an operator the GPU backend lacks: the processor runs it, and the page says so.
      session = null;
    }
  }
  session = await ort.InferenceSession.create(new Uint8Array(model), { executionProviders: ['wasm'] });
  return 'wasm';
}

/** The photo as the model reads it: cropped, scaled to 480 × 480, RGB in 0–1, rows first (NHWC). */
async function pixels(photo: Blob): Promise<Float32Array> {
  const bitmap = await createImageBitmap(photo);
  try {
    const crop = speciesCrop(bitmap.width, bitmap.height);
    const canvas = new OffscreenCanvas(SPECIES_INPUT_SIZE, SPECIES_INPUT_SIZE);
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('No 2D canvas in this worker.');
    context.imageSmoothingQuality = 'low';
    context.drawImage(bitmap, crop.x, crop.y, crop.width, crop.height, 0, 0, SPECIES_INPUT_SIZE, SPECIES_INPUT_SIZE);
    const rgba = context.getImageData(0, 0, SPECIES_INPUT_SIZE, SPECIES_INPUT_SIZE).data;
    const out = new Float32Array(SPECIES_INPUT_SIZE * SPECIES_INPUT_SIZE * 3);
    for (let pixel = 0, index = 0; pixel < rgba.length; pixel += 4) {
      out[index++] = rgba[pixel]! / 255;
      out[index++] = rgba[pixel + 1]! / 255;
      out[index++] = rgba[pixel + 2]! / 255;
    }
    return out;
  } finally {
    bitmap.close();
  }
}

self.onmessage = async (event: MessageEvent<SpeciesRequest>) => {
  const request = event.data;
  try {
    if (request.type === 'load') {
      post({ type: 'loaded', backend: await createSession(request.model) });
      return;
    }
    if (!session) throw new Error('The model is not loaded.');
    const input = await pixels(request.photo);
    const output = await session.run({
      image: new ort.Tensor('float32', input, [1, SPECIES_INPUT_SIZE, SPECIES_INPUT_SIZE, 3]),
    });
    const logits = output.logits!.data as Float32Array;
    // Softmax, then the five best, as the original reports them.
    let max = -Infinity;
    for (const value of logits) max = Math.max(max, value);
    let sum = 0;
    const scores = new Float32Array(logits.length);
    for (let index = 0; index < logits.length; index += 1) sum += scores[index] = Math.exp(logits[index]! - max);
    const top = [...scores.keys()]
      .sort((a, b) => scores[b]! - scores[a]!)
      .slice(0, 5)
      .map((index) => ({ index, score: scores[index]! / sum }));
    post({ type: 'classified', id: request.id, top });
  } catch (error) {
    post({
      type: 'error',
      id: 'id' in request ? request.id : null,
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
