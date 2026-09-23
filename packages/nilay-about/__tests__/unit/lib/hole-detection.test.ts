import { describe, expect, it } from 'vitest';

import { detectHoles, thresholdFor, toGrayscale, type GrayImage } from '@/lib/hole-detection';

/** A blank board to draw on: one brightness everywhere, the way lit paper photographs. */
const board = (width: number, height: number, value = 235): GrayImage => ({
  width,
  height,
  data: new Uint8ClampedArray(width * height).fill(value),
});

/** A filled circle, which is what a hole punched in paper looks like from the front. */
const disc = (image: GrayImage, centreX: number, centreY: number, diameter: number, value: number) => {
  const radius = diameter / 2;
  for (let y = Math.floor(centreY - radius); y <= Math.ceil(centreY + radius); y++) {
    for (let x = Math.floor(centreX - radius); x <= Math.ceil(centreX + radius); x++) {
      if (x < 0 || y < 0 || x >= image.width || y >= image.height) continue;
      if (Math.hypot(x - centreX, y - centreY) <= radius) image.data[y * image.width + x] = value;
    }
  }
  return image;
};

const wholeImage = (image: GrayImage) => ({
  x: image.width / 2,
  y: image.height / 2,
  radius: Math.hypot(image.width, image.height) / 2,
});

describe('turning a photo into brightness values', () => {
  it('weights the channels the way a camera weights them, green most and blue least', () => {
    const rgba = new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 0, 0, 0, 255]);
    const gray = toGrayscale(rgba, 4, 1);
    expect([...gray.data]).toEqual([54, 182, 18, 0]);
    expect({ width: gray.width, height: gray.height }).toEqual({ width: 4, height: 1 });
  });
});

describe('the brightness difference a setting asks for', () => {
  it('runs from strict to loose, and holds a value that is out of range or missing', () => {
    expect(thresholdFor(0)).toBe(90);
    expect(thresholdFor(1)).toBe(10);
    expect(thresholdFor(0.5)).toBe(50);
    expect(thresholdFor(-4)).toBe(90);
    expect(thresholdFor(9)).toBe(10);
    expect(thresholdFor(Number.NaN)).toBe(50);
  });
});

describe('finding the holes', () => {
  const options = { holeDiameterPx: 10, sensitivity: 0.5 };

  it('marks a hole at its centre, and measures it across', () => {
    const image = disc(board(200, 160), 70, 90, 10, 30);
    const result = detectHoles(image, { ...options, region: wholeImage(image) });
    expect(result.holes).toHaveLength(1);
    const hole = result.holes[0];
    expect(hole?.x).toBeCloseTo(70, 0);
    expect(hole?.y).toBeCloseTo(90, 0);
    expect(hole?.diameterPx).toBeGreaterThan(8);
    expect(hole?.diameterPx).toBeLessThan(12);
    expect(hole?.polarity).toBe('darker');
    expect(result.thresholdUsed).toBe(50);
  });

  it('marks several holes, in reading order, whatever order they were drawn in', () => {
    const image = board(240, 200);
    disc(image, 180, 150, 10, 25);
    disc(image, 60, 40, 10, 25);
    disc(image, 170, 40, 10, 25);
    const result = detectHoles(image, { ...options, region: wholeImage(image) });
    expect(result.holes.map((hole) => [Math.round(hole.x), Math.round(hole.y)])).toEqual([
      [60, 40],
      [170, 40],
      [180, 150],
    ]);
  });

  it('looks only inside the region it is given', () => {
    const image = board(240, 200);
    disc(image, 60, 100, 10, 25);
    disc(image, 200, 100, 10, 25);
    const result = detectHoles(image, { ...options, region: { x: 60, y: 100, radius: 40 } });
    expect(result.holes.map((hole) => Math.round(hole.x))).toEqual([60]);
  });

  it('turns down a speck too small to be a hole and a shape too large to be one', () => {
    const image = board(240, 200);
    disc(image, 60, 100, 2, 20);
    disc(image, 170, 100, 40, 20);
    const result = detectHoles(image, { ...options, region: wholeImage(image) });
    expect(result.holes).toHaveLength(0);
    expect(result.rejected.tooSmall).toBe(1);
    // A large dark shape leaves two marks, not one: a dark rim inside its edge, where the
    // surrounding average is still bright, and a bright rim outside it, where that average has
    // been pulled down. Both are far too big to be a hole, which is the point.
    expect(result.rejected.tooLarge).toBe(2);
  });

  it('turns down a scratch, which fills its box but is nothing like round', () => {
    const image = board(240, 200);
    for (let x = 40; x < 130; x++) image.data[100 * 240 + x] = 20;
    const result = detectHoles(image, { ...options, region: wholeImage(image) });
    expect(result.holes).toHaveLength(0);
    expect(result.rejected.tooRagged).toBe(1);
  });

  it('finds a hole that shows lighter than the paper, as one in a printed bull does', () => {
    const image = board(240, 200, 30);
    disc(image, 120, 100, 10, 230);
    const both = detectHoles(image, { ...options, region: wholeImage(image) });
    expect(both.holes.map((hole) => hole.polarity)).toEqual(['lighter']);
    const darkOnly = detectHoles(image, { ...options, region: wholeImage(image), polarity: 'darker' });
    expect(darkOnly.holes).toHaveLength(0);
  });

  it('finds holes on both sides of a printed bull in one pass', () => {
    const image = board(300, 240);
    disc(image, 150, 120, 90, 28);
    disc(image, 150, 120, 10, 235);
    disc(image, 60, 60, 10, 28);
    const result = detectHoles(image, { ...options, region: wholeImage(image) });
    expect(result.holes.map((hole) => hole.polarity).sort()).toEqual(['darker', 'lighter']);
    // The bull itself is far too big to be a hole, so it is turned down rather than marked.
    expect(result.rejected.tooLarge).toBeGreaterThan(0);
  });

  it('misses a faint hole when set strict, and finds it when set loose', () => {
    const image = disc(board(200, 160, 200), 100, 80, 10, 165);
    const strict = detectHoles(image, { region: wholeImage(image), holeDiameterPx: 10, sensitivity: 0 });
    const loose = detectHoles(image, { region: wholeImage(image), holeDiameterPx: 10, sensitivity: 1 });
    expect(strict.holes).toHaveLength(0);
    expect(loose.holes).toHaveLength(1);
  });

  it('keeps the largest marks when there are more than asked for, and says how many it dropped', () => {
    const image = board(240, 200);
    disc(image, 60, 60, 12, 25);
    disc(image, 160, 60, 10, 25);
    disc(image, 60, 150, 8, 25);
    const result = detectHoles(image, { ...options, region: wholeImage(image), maxHoles: 2 });
    expect(result.holes).toHaveLength(2);
    expect(result.rejected.overCap).toBe(1);
    expect(result.holes.every((hole) => hole.diameterPx > 8)).toBe(true);
  });

  it('gives the same answer twice from the same photo', () => {
    const image = board(240, 200);
    disc(image, 60, 60, 10, 25);
    disc(image, 160, 140, 10, 25);
    const region = wholeImage(image);
    expect(detectHoles(image, { ...options, region })).toEqual(detectHoles(image, { ...options, region }));
  });

  it('finds nothing rather than failing on an empty image or an impossible setting', () => {
    const image = board(240, 200);
    disc(image, 120, 100, 10, 25);
    const region = wholeImage(image);
    for (const broken of [
      { ...options, region, holeDiameterPx: 0 },
      { ...options, region, holeDiameterPx: Number.NaN },
      { ...options, region: { x: 120, y: 100, radius: 0 } },
      { ...options, region: { x: Number.NaN, y: 100, radius: 40 } },
      { ...options, region, maxHoles: 0 },
    ])
      expect(detectHoles(image, broken).holes).toHaveLength(0);
    expect(detectHoles(board(0, 0), { ...options, region: { x: 0, y: 0, radius: 10 } }).holes).toHaveLength(0);
  });
});

describe('the awkward edges', () => {
  const options = { holeDiameterPx: 10, sensitivity: 0.5 };

  it('measures a hole against the paper it can see when the window runs off the image', () => {
    // The background window is wider than the margin here, so it is clipped at the edge. The
    // hole still has to come back at its centre rather than pulled towards the middle.
    const image = disc(board(120, 120), 8, 60, 10, 25);
    const result = detectHoles(image, { ...options, region: wholeImage(image) });
    expect(result.holes).toHaveLength(1);
    expect(result.holes[0]?.x).toBeCloseTo(8, 0);
    expect(result.holes[0]?.y).toBeCloseTo(60, 0);
  });

  it('finds what lies inside a region that hangs off the edge of the photo', () => {
    const image = board(200, 160);
    disc(image, 12, 12, 10, 25);
    disc(image, 150, 120, 10, 25);
    const result = detectHoles(image, { ...options, region: { x: -20, y: -20, radius: 80 } });
    expect(result.holes.map((hole) => Math.round(hole.x))).toEqual([12]);
  });

  it('finds nothing when the region lies wholly outside the photo, either side', () => {
    const image = disc(board(200, 160), 100, 80, 10, 25);
    for (const region of [
      { x: -400, y: 80, radius: 50 },
      { x: 700, y: 80, radius: 50 },
      { x: 100, y: -400, radius: 50 },
      { x: 100, y: 700, radius: 50 },
    ])
      expect(detectHoles(image, { ...options, region }).holes).toHaveLength(0);
  });

  it('survives a photo one pixel across, and a hole larger than the photo', () => {
    expect(detectHoles(board(1, 1), { ...options, region: { x: 0, y: 0, radius: 4 } }).holes).toHaveLength(0);
    const image = disc(board(60, 60), 30, 30, 10, 25);
    const result = detectHoles(image, { region: wholeImage(image), holeDiameterPx: 400, sensitivity: 0.5 });
    // Nothing in a 60 px photo can be 400 px across, so the mark is turned down rather than kept.
    expect(result.holes).toHaveLength(0);
    expect(result.rejected.tooSmall).toBeGreaterThan(0);
  });

  it('finds nothing on blank paper, however sensitive the setting', () => {
    for (const sensitivity of [0, 0.5, 1]) {
      const result = detectHoles(board(160, 120), { ...options, region: wholeImage(board(160, 120)), sensitivity });
      expect({ sensitivity, found: result.holes.length }).toEqual({ sensitivity, found: 0 });
    }
  });
});

describe('a hole that does not read the same all the way across', () => {
  const options = { holeDiameterPx: 10, sensitivity: 0.5 };

  /** A hole lying across a shadow line: one half in shade, the other on the lit backing. */
  const splitHole = (image: GrayImage, centreX: number, centreY: number, diameter: number) => {
    const radius = diameter / 2;
    for (let y = Math.floor(centreY - radius); y <= Math.ceil(centreY + radius); y++) {
      for (let x = Math.floor(centreX - radius); x <= Math.ceil(centreX + radius); x++) {
        if (x < 0 || y < 0 || x >= image.width || y >= image.height) continue;
        if (Math.hypot(x - centreX, y - centreY) <= radius) image.data[y * image.width + x] = x < centreX ? 0 : 255;
      }
    }
    return image;
  };

  it('counts it once, at the middle of the whole hole', () => {
    const image = splitHole(board(160, 120, 128), 80, 60, 10);
    const result = detectHoles(image, { ...options, region: wholeImage(image) });
    expect(result.holes).toHaveLength(1);
    expect(result.holes[0]?.x).toBeCloseTo(80, 0);
    expect(result.holes[0]?.y).toBeCloseTo(60, 0);
    // Both halves together are the hole, so its width comes back near what was drawn.
    expect(result.holes[0]?.diameterPx).toBeGreaterThan(8);
  });

  it('still counts two holes of the same kind that close together as two', () => {
    const image = board(160, 120);
    disc(image, 70, 60, 8, 25);
    disc(image, 82, 60, 8, 25);
    const result = detectHoles(image, { ...options, region: wholeImage(image) });
    expect(result.holes).toHaveLength(2);
  });
});

describe('marks that run past an edge', () => {
  const options = { holeDiameterPx: 10, sensitivity: 0.5 };

  it('turns down a hole cut off by the frame rather than mismeasuring it', () => {
    const image = disc(board(160, 120), 0, 60, 10, 25);
    const result = detectHoles(image, { ...options, region: wholeImage(image) });
    expect(result.holes).toHaveLength(0);
    expect(result.rejected.clipped).toBe(1);
  });

  it('measures a hole lying across the region boundary whole before placing it', () => {
    // The boundary runs through x = 100, and this hole straddles it: 93 to 103. Its middle is
    // inside, so it is kept, and it has to be measured from all of it rather than the part in.
    const image = board(240, 200);
    disc(image, 98, 100, 10, 25);
    disc(image, 180, 100, 10, 25);
    const result = detectHoles(image, { ...options, region: { x: 60, y: 100, radius: 40 } });
    expect(result.holes.map((hole) => Math.round(hole.x))).toEqual([98]);
    expect(result.holes[0]?.diameterPx).toBeGreaterThan(9);
  });

  it('drops a hole whose middle falls outside the region, even when it reaches in', () => {
    // 103 to 113, so it overlaps the boundary at x = 100 from the far side.
    const image = disc(board(240, 200), 108, 100, 10, 25);
    expect(detectHoles(image, { ...options, region: { x: 60, y: 100, radius: 40 } }).holes).toHaveLength(0);
  });
});
