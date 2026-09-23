import { toGrayscale, type GrayImage } from './hole-detection';

/**
 * Reading the pixels of a decoded photograph, which is the one step of the analysis that needs
 * a browser. It is kept apart from `hole-detection` so that the arithmetic there stays testable
 * without a canvas, and so that the rule about where the photo may go lives in one place: the
 * drawing happens on a canvas this module makes and throws away, and nothing leaves the page.
 */

/** The longest side an analysis runs at. A larger photo is scaled down to it first. */
export const ANALYSIS_MAX_SIDE = 1600;

export interface ImagePixels {
  image: GrayImage;
  /**
   * Analysis pixels per photo pixel, one ratio per axis. The two canvas sides are rounded to
   * whole pixels separately, so they are not quite the same ratio, and using one of them for
   * both axes walks a mark up to a pixel out of place along the longer side of a large photo.
   */
  scaleX: number;
  scaleY: number;
}

/**
 * A photograph as brightness values, capped at a working resolution.
 *
 * Returns null where the pixels cannot be read at all: a browser with no 2D canvas, a photo that
 * has not finished decoding, or an image from another origin, which taints the canvas and makes
 * `getImageData` throw. A caller has nothing to analyse in any of those cases.
 */
export function readImagePixels(image: HTMLImageElement, maxSide: number = ANALYSIS_MAX_SIDE): ImagePixels | null {
  const width = image.naturalWidth;
  const height = image.naturalHeight;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  const scale = Math.min(1, maxSide / Math.max(width, height));
  const canvasWidth = Math.max(1, Math.round(width * scale));
  const canvasHeight = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return null;
  try {
    context.drawImage(image, 0, 0, canvasWidth, canvasHeight);
    const pixels = context.getImageData(0, 0, canvasWidth, canvasHeight);
    return {
      image: toGrayscale(pixels.data, canvasWidth, canvasHeight),
      scaleX: canvasWidth / width,
      scaleY: canvasHeight / height,
    };
  } catch {
    return null;
  }
}
