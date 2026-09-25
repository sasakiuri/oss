/**
 * Making red stand out in a photo of the ground, to help find blood on a trail.
 *
 * Each pixel is read as hue, saturation and value. A pixel whose hue is near red and that is
 * saturated and bright enough is painted in a marker colour; everything else is turned grey and
 * dimmed, so the marks stand out even to a reader who cannot tell red from green. Sensitivity widens
 * the hue band and lowers the saturation it asks for.
 *
 * It picks out colour, not blood: red leaves, berries, rust and some soils light up too, and old
 * dark blood or blood under a torch's warm light may not. It is an aid to looking, never a finding.
 */

export type HighlightColour = 'cyan' | 'yellow';

const markers: Record<HighlightColour, [number, number, number]> = {
  cyan: [0, 229, 255],
  yellow: [255, 234, 0],
};

export interface HighlightSettings {
  /** 0 (strictest) to 100 (loosest). */
  sensitivity: number;
  colour: HighlightColour;
}

/** The hue band half-width in degrees and the least saturation and value a red pixel needs. */
export function thresholds(sensitivity: number): { hueHalfWidth: number; minSaturation: number; minValue: number } {
  const s = Math.max(0, Math.min(100, sensitivity)) / 100;
  return {
    hueHalfWidth: 12 + 18 * s,
    minSaturation: 0.55 - 0.3 * s,
    minValue: 0.25 - 0.13 * s,
  };
}

/** Hue in degrees from red (0 to 180 either way), saturation and value, of one RGB pixel. */
function hsv(red: number, green: number, blue: number) {
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  const value = max / 255;
  const saturation = max === 0 ? 0 : delta / max;
  let hue = 0;
  if (delta > 0) {
    if (max === red) hue = 60 * (((green - blue) / delta) % 6);
    else if (max === green) hue = 60 * ((blue - red) / delta + 2);
    else hue = 60 * ((red - green) / delta + 4);
  }
  const fromRed = Math.min(Math.abs(hue), 360 - Math.abs(hue));
  return { fromRed, saturation, value };
}

export function isReddish(red: number, green: number, blue: number, sensitivity: number): boolean {
  const limit = thresholds(sensitivity);
  const pixel = hsv(red, green, blue);
  return (
    pixel.fromRed <= limit.hueHalfWidth && pixel.saturation >= limit.minSaturation && pixel.value >= limit.minValue
  );
}

/**
 * Rewrites RGBA pixels in place into the highlighted view, and returns the share of pixels marked.
 * Alpha is left as it was.
 */
export function highlightRed(pixels: Uint8ClampedArray, settings: HighlightSettings): number {
  const [markRed, markGreen, markBlue] = markers[settings.colour];
  let marked = 0;
  const count = pixels.length / 4;
  for (let index = 0; index < pixels.length; index += 4) {
    const red = pixels[index]!;
    const green = pixels[index + 1]!;
    const blue = pixels[index + 2]!;
    if (isReddish(red, green, blue, settings.sensitivity)) {
      pixels[index] = markRed;
      pixels[index + 1] = markGreen;
      pixels[index + 2] = markBlue;
      marked += 1;
    } else {
      // Rec. 601 luma, dimmed so the marks keep the brightest place in the picture.
      const grey = Math.round((0.299 * red + 0.587 * green + 0.114 * blue) * 0.55);
      pixels[index] = grey;
      pixels[index + 1] = grey;
      pixels[index + 2] = grey;
    }
  }
  return count === 0 ? 0 : marked / count;
}
