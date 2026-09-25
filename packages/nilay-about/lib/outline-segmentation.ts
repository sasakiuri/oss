/**
 * The arithmetic around SlimSAM, the promptable segmentation model the photo measurement tool uses
 * to outline an animal. The model reads a 1024-pixel square and answers with three candidate masks
 * at 256 pixels; this module fits a photo into that square, places the reader's taps in it and reads
 * the chosen mask back at the photo's working size. It follows the pre- and post-processing that
 * ships with the model (`preprocessor_config.json`: longest side resized to 1024, scaled to 0–1,
 * normalised by the ImageNet mean and deviation, padded at the right and bottom with zeros).
 *
 * Running the model needs a browser and lives in `outline-model.ts`. Everything here is plain
 * numbers, so it is tested on its own.
 */

export const SAM_INPUT_SIZE = 1024;
export const SAM_MASK_SIZE = 256;

const MEAN = [0.485, 0.456, 0.406] as const;
const STD = [0.229, 0.224, 0.225] as const;

export interface SamFit {
  /** Model pixels per photo pixel. */
  scale: number;
  /** The photo's size once resized, which is also the size of the mask this module returns. */
  width: number;
  height: number;
}

/** The size the photo is drawn at before it goes in: the longest side at 1024, the other rounded. */
export function samFit(photoWidth: number, photoHeight: number): SamFit | null {
  if (!(photoWidth > 0) || !(photoHeight > 0)) return null;
  const scale = SAM_INPUT_SIZE / Math.max(photoWidth, photoHeight);
  return {
    scale,
    width: Math.min(SAM_INPUT_SIZE, Math.max(1, Math.floor(photoWidth * scale + 0.5))),
    height: Math.min(SAM_INPUT_SIZE, Math.max(1, Math.floor(photoHeight * scale + 0.5))),
  };
}

/**
 * RGBA pixels of the photo already drawn at the fitted size, as the model's input tensor: three
 * planes of 1024 × 1024, normalised, with zeros where the photo does not reach.
 */
export function toSamPixelValues(rgba: Uint8ClampedArray | Uint8Array, width: number, height: number): Float32Array {
  if (rgba.length !== width * height * 4 || width > SAM_INPUT_SIZE || height > SAM_INPUT_SIZE)
    throw new RangeError('The pixels do not match the fitted size.');
  const plane = SAM_INPUT_SIZE * SAM_INPUT_SIZE;
  const values = new Float32Array(plane * 3);
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) {
      const source = (y * width + x) * 4;
      const target = y * SAM_INPUT_SIZE + x;
      for (let channel = 0; channel < 3; channel += 1)
        values[channel * plane + target] = (rgba[source + channel]! / 255 - MEAN[channel]!) / STD[channel]!;
    }
  return values;
}

/** Index of the candidate mask the model itself rates best. */
export function bestMaskIndex(iouScores: ArrayLike<number>): number {
  let best = 0;
  for (let index = 1; index < iouScores.length; index += 1) if (iouScores[index]! > iouScores[best]!) best = index;
  return best;
}

/**
 * One of the 256 × 256 mask logits read back at the fitted size, pixel by pixel: 1 inside the
 * outline, 0 outside. The low-resolution mask covers the whole padded square, so a pixel of the
 * fitted photo sits at a quarter of its coordinate there; the logit is interpolated between the four
 * nearest cells and the boundary is where it crosses zero, as in the model's own post-processing.
 */
export function maskAtFit(logits: ArrayLike<number>, fit: SamFit): Uint8Array {
  if (logits.length !== SAM_MASK_SIZE * SAM_MASK_SIZE) throw new RangeError('A mask has 256 × 256 logits.');
  const ratio = SAM_MASK_SIZE / SAM_INPUT_SIZE;
  const last = SAM_MASK_SIZE - 1;
  const mask = new Uint8Array(fit.width * fit.height);
  for (let y = 0; y < fit.height; y += 1) {
    const my = Math.min(last, Math.max(0, (y + 0.5) * ratio - 0.5));
    const y0 = Math.floor(my);
    const y1 = Math.min(last, y0 + 1);
    const fy = my - y0;
    for (let x = 0; x < fit.width; x += 1) {
      const mx = Math.min(last, Math.max(0, (x + 0.5) * ratio - 0.5));
      const x0 = Math.floor(mx);
      const x1 = Math.min(last, x0 + 1);
      const fx = mx - x0;
      const top = logits[y0 * SAM_MASK_SIZE + x0]! * (1 - fx) + logits[y0 * SAM_MASK_SIZE + x1]! * fx;
      const bottom = logits[y1 * SAM_MASK_SIZE + x0]! * (1 - fx) + logits[y1 * SAM_MASK_SIZE + x1]! * fx;
      if (top * (1 - fy) + bottom * fy > 0) mask[y * fit.width + x] = 1;
    }
  }
  return mask;
}

/** The share of the photo the outline covers, which the screen uses to catch a mask of the whole frame. */
export function maskCoverage(mask: ArrayLike<number>): number {
  if (mask.length === 0) return 0;
  let inside = 0;
  for (let index = 0; index < mask.length; index += 1) if (mask[index]) inside += 1;
  return inside / mask.length;
}
