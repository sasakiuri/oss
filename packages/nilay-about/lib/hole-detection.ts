/**
 * Finding the holes in a photograph of a target or a pattern board.
 *
 * A hole is a small patch that differs from the paper immediately around it: darker where the
 * light comes from the front and the hole falls into shadow, lighter where the backing shows
 * through. That local comparison is the whole idea. It is what lets one threshold work across a
 * photo lit unevenly, and it is why a printed bull, a scoring ring or a shadow across the board
 * is not mistaken for a hole: those are large, and a hole is the size of the bullet that made it.
 *
 * Nothing here touches the DOM. It works on a plain array of brightness values, so the arithmetic
 * can be checked against drawn images rather than against a photograph nobody can reproduce.
 */

/** A photo reduced to one brightness value per pixel, row by row from the top left. */
export interface GrayImage {
  width: number;
  height: number;
  /** Luminance, 0 (black) to 255 (white), one entry per pixel. */
  data: Uint8ClampedArray;
}

/** Whether a hole reads darker than the paper around it, lighter, or may be either. */
export type HolePolarity = 'darker' | 'lighter' | 'either';

export interface HoleDetectionOptions {
  /** Only pixels inside this circle are examined. */
  region: { x: number; y: number; radius: number };
  /** The hole diameter to look for, in pixels of this image. */
  holeDiameterPx: number;
  /** 0 finds only what stands out sharply; 1 accepts the faintest difference. */
  sensitivity: number;
  polarity?: HolePolarity;
  /** A guard against a photo of noise producing thousands of marks. */
  maxHoles?: number;
}

export interface DetectedHole {
  x: number;
  y: number;
  /** The diameter of a circle with the same area as the patch that was found. */
  diameterPx: number;
  pixels: number;
  polarity: 'darker' | 'lighter';
}

export interface HoleDetectionResult {
  holes: DetectedHole[];
  /**
   * The patches that were found and turned down, by the reason. These are shown rather than
   * dropped silently: a board where every hole came back "too large" has merged holes, and the
   * reader needs to know that the count on screen is short rather than wonder why.
   */
  rejected: { tooSmall: number; tooLarge: number; tooRagged: number; clipped: number; overCap: number };
  /** How far from the surrounding paper a pixel had to be, in brightness levels. */
  thresholdUsed: number;
}

/** A patch smaller than half the expected hole is dirt; one over two and a half is not a hole. */
const MIN_DIAMETER_SCALE = 0.5;
const MAX_DIAMETER_SCALE = 2.5;
/** A hole is round. A scratch, a fold or the edge of a printed line is not. */
const MIN_FILL_RATIO = 0.45;
const MIN_ASPECT_RATIO = 0.45;
/** The background is averaged over this multiple of the hole, so a hole cannot darken its own. */
const BACKGROUND_WINDOW_SCALE = 4;
/**
 * A dark patch and a light patch nearer than this are one hole seen from two sides, not two.
 * A hole photographed across a shadow line, or one torn rather than punched, shows a shaded
 * crescent on one side and the lit backing on the other, and each half can pass on its own.
 */
const MERGE_DISTANCE_SCALE = 0.8;
const DEFAULT_MAX_HOLES = 500;

/** The brightness difference the least and the most sensitive settings ask for. */
const STRICTEST_THRESHOLD = 90;
const LOOSEST_THRESHOLD = 10;

/** Rec. 709 luminance, the weighting a camera's own monochrome mode uses. */
export function toGrayscale(rgba: Uint8ClampedArray, width: number, height: number): GrayImage {
  const data = new Uint8ClampedArray(width * height);
  for (let index = 0; index < data.length; index++) {
    const offset = index * 4;
    data[index] = 0.2126 * (rgba[offset] ?? 0) + 0.7152 * (rgba[offset + 1] ?? 0) + 0.0722 * (rgba[offset + 2] ?? 0);
  }
  return { width, height, data };
}

/** The brightness difference a setting asks for, so a screen can say what it is about to use. */
export function thresholdFor(sensitivity: number): number {
  const level = Number.isFinite(sensitivity) ? Math.min(1, Math.max(0, sensitivity)) : 0.5;
  return Math.round(STRICTEST_THRESHOLD + (LOOSEST_THRESHOLD - STRICTEST_THRESHOLD) * level);
}

/** A summed-area table, so the mean over any window costs four lookups whatever its size. */
function integralOf({ width, height, data }: GrayImage): Float64Array {
  const sums = new Float64Array((width + 1) * (height + 1));
  for (let y = 0; y < height; y++) {
    let row = 0;
    for (let x = 0; x < width; x++) {
      row += data[y * width + x] ?? 0;
      sums[(y + 1) * (width + 1) + x + 1] = (sums[y * (width + 1) + x + 1] ?? 0) + row;
    }
  }
  return sums;
}

function windowMean(sums: Float64Array, width: number, height: number, x: number, y: number, radius: number): number {
  const left = Math.max(0, x - radius);
  const top = Math.max(0, y - radius);
  const right = Math.min(width - 1, x + radius);
  const bottom = Math.min(height - 1, y + radius);
  const stride = width + 1;
  const total =
    (sums[(bottom + 1) * stride + right + 1] ?? 0) -
    (sums[top * stride + right + 1] ?? 0) -
    (sums[(bottom + 1) * stride + left] ?? 0) +
    (sums[top * stride + left] ?? 0);
  return total / ((right - left + 1) * (bottom - top + 1));
}

interface Patch {
  sumX: number;
  sumY: number;
  pixels: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/**
 * Join a dark half and a light half of the same hole. Only opposite halves are joined: two marks
 * of the same kind that close together are two holes in a tight group, and merging those would
 * lose a shot. The joined mark sits at the centre of the two weighted by area, which is where
 * the whole hole is.
 */
function mergeAcrossPolarity(holes: readonly DetectedHole[], within: number): DetectedHole[] {
  const lighter = holes.filter((hole) => hole.polarity === 'lighter');
  const taken = new Set<number>();
  const merged: DetectedHole[] = [];
  for (const dark of holes) {
    if (dark.polarity !== 'darker') continue;
    let nearest = -1;
    let nearestDistance = within;
    lighter.forEach((light, index) => {
      if (taken.has(index)) return;
      const distance = Math.hypot(light.x - dark.x, light.y - dark.y);
      if (distance <= nearestDistance) {
        nearest = index;
        nearestDistance = distance;
      }
    });
    const light = nearest < 0 ? null : (lighter[nearest] as DetectedHole);
    if (light === null) {
      merged.push(dark);
      continue;
    }
    taken.add(nearest);
    const pixels = dark.pixels + light.pixels;
    merged.push({
      x: (dark.x * dark.pixels + light.x * light.pixels) / pixels,
      y: (dark.y * dark.pixels + light.y * light.pixels) / pixels,
      diameterPx: 2 * Math.sqrt(pixels / Math.PI),
      pixels,
      polarity: dark.pixels >= light.pixels ? 'darker' : 'lighter',
    });
  }
  lighter.forEach((light, index) => {
    if (!taken.has(index)) merged.push(light);
  });
  return merged;
}

/**
 * Every run of pixels the mask marks, grouped into patches that touch one another, counting a
 * diagonal touch as joined so that a round hole does not come back as two crescents.
 */
function patchesIn(mask: Uint8Array, width: number, height: number): Patch[] {
  const seen = new Uint8Array(mask.length);
  const patches: Patch[] = [];
  const stack: number[] = [];
  for (let start = 0; start < mask.length; start++) {
    if (mask[start] === 0 || seen[start] === 1) continue;
    seen[start] = 1;
    stack.push(start);
    const patch: Patch = {
      sumX: 0,
      sumY: 0,
      pixels: 0,
      minX: width,
      maxX: -1,
      minY: height,
      maxY: -1,
    };
    while (stack.length > 0) {
      const index = stack.pop() as number;
      const x = index % width;
      const y = (index - x) / width;
      patch.sumX += x;
      patch.sumY += y;
      patch.pixels += 1;
      if (x < patch.minX) patch.minX = x;
      if (x > patch.maxX) patch.maxX = x;
      if (y < patch.minY) patch.minY = y;
      if (y > patch.maxY) patch.maxY = y;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= width) continue;
          const neighbour = ny * width + nx;
          if (mask[neighbour] === 1 && seen[neighbour] === 0) {
            seen[neighbour] = 1;
            stack.push(neighbour);
          }
        }
      }
    }
    patches.push(patch);
  }
  return patches;
}

/**
 * Mark the holes in one image.
 *
 * The result is a starting point, not a verdict: the screens that call this let the reader add
 * what was missed and delete what was not a hole, because no threshold separates a pellet hole
 * from a speck of dirt in every photograph ever taken.
 */
export function detectHoles(image: GrayImage, options: HoleDetectionOptions): HoleDetectionResult {
  const { width, height } = image;
  const { region, holeDiameterPx, sensitivity } = options;
  const polarity = options.polarity ?? 'either';
  const maxHoles = options.maxHoles ?? DEFAULT_MAX_HOLES;
  const threshold = thresholdFor(sensitivity);
  const empty: HoleDetectionResult = {
    holes: [],
    rejected: { tooSmall: 0, tooLarge: 0, tooRagged: 0, clipped: 0, overCap: 0 },
    thresholdUsed: threshold,
  };
  if (
    width <= 0 ||
    height <= 0 ||
    image.data.length < width * height ||
    !Number.isFinite(holeDiameterPx) ||
    holeDiameterPx <= 0 ||
    !Number.isFinite(region.radius) ||
    region.radius <= 0 ||
    !Number.isFinite(region.x) ||
    !Number.isFinite(region.y)
  )
    return empty;

  const sums = integralOf(image);
  const backgroundRadius = Math.max(1, Math.round((holeDiameterPx * BACKGROUND_WINDOW_SCALE) / 2));
  const darker = new Uint8Array(width * height);
  const lighter = new Uint8Array(width * height);
  // The scan reaches a hole's width past the region, so a mark lying across the boundary is
  // whole by the time it is decided whether its middle is inside. Scanning only to the boundary
  // would cut such a mark in half and put what was left of it in the wrong place.
  const scanRadius = region.radius + holeDiameterPx;
  const left = Math.max(0, Math.floor(region.x - scanRadius));
  const right = Math.min(width - 1, Math.ceil(region.x + scanRadius));
  const top = Math.max(0, Math.floor(region.y - scanRadius));
  const bottom = Math.min(height - 1, Math.ceil(region.y + scanRadius));
  const scanSquared = scanRadius * scanRadius;
  const radiusSquared = region.radius * region.radius;
  for (let y = top; y <= bottom; y++) {
    for (let x = left; x <= right; x++) {
      const dx = x - region.x;
      const dy = y - region.y;
      if (dx * dx + dy * dy > scanSquared) continue;
      const index = y * width + x;
      const value = image.data[index] ?? 0;
      const background = windowMean(sums, width, height, x, y, backgroundRadius);
      if (polarity !== 'lighter' && background - value >= threshold) darker[index] = 1;
      else if (polarity !== 'darker' && value - background >= threshold) lighter[index] = 1;
    }
  }

  const minDiameter = holeDiameterPx * MIN_DIAMETER_SCALE;
  const maxDiameter = holeDiameterPx * MAX_DIAMETER_SCALE;
  const rejected = { tooSmall: 0, tooLarge: 0, tooRagged: 0, clipped: 0, overCap: 0 };
  const found: DetectedHole[] = [];
  for (const [mask, sense] of [
    [darker, 'darker'],
    [lighter, 'lighter'],
  ] as const) {
    for (const patch of patchesIn(mask, width, height)) {
      const x = patch.sumX / patch.pixels;
      const y = patch.sumY / patch.pixels;
      // A mark found in the margin beyond the region belongs to whatever is out there, not here.
      if ((x - region.x) * (x - region.x) + (y - region.y) * (y - region.y) > radiusSquared) continue;
      // A mark running off the frame has been cut: its middle is not where it looks, and its
      // width is whatever happened to stay in shot. Neither can be measured, so it is not kept.
      if (patch.minX === 0 || patch.minY === 0 || patch.maxX === width - 1 || patch.maxY === height - 1) {
        rejected.clipped += 1;
        continue;
      }
      const diameter = 2 * Math.sqrt(patch.pixels / Math.PI);
      if (diameter < minDiameter) {
        rejected.tooSmall += 1;
        continue;
      }
      if (diameter > maxDiameter) {
        rejected.tooLarge += 1;
        continue;
      }
      const boxWidth = patch.maxX - patch.minX + 1;
      const boxHeight = patch.maxY - patch.minY + 1;
      const fill = patch.pixels / (boxWidth * boxHeight);
      const aspect = Math.min(boxWidth, boxHeight) / Math.max(boxWidth, boxHeight);
      if (fill < MIN_FILL_RATIO || aspect < MIN_ASPECT_RATIO) {
        rejected.tooRagged += 1;
        continue;
      }
      found.push({ x, y, diameterPx: diameter, pixels: patch.pixels, polarity: sense });
    }
  }

  const joined = polarity === 'either' ? mergeAcrossPolarity(found, holeDiameterPx * MERGE_DISTANCE_SCALE) : found;
  // The largest patches are the ones most likely to be holes, so a cap keeps those and says how
  // many it dropped. The marks themselves come back in reading order, which is also a fixed one.
  const kept = joined.sort((a, b) => b.pixels - a.pixels).slice(0, Math.max(0, maxHoles));
  rejected.overCap = joined.length - kept.length;
  return {
    holes: kept.sort((a, b) => a.y - b.y || a.x - b.x),
    rejected,
    thresholdUsed: threshold,
  };
}
