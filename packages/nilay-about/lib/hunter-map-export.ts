/**
 * The aligned map as a KMZ for other map apps (GPS apps that take a KMZ as a custom map), cut into
 * pieces when a single picture would be too large for the app, and the traced areas as KML.
 *
 * Needs a browser: the picture is cut on a canvas. The arithmetic is in ./kml and ./hunter-map.
 */

import type { GeoPoint } from './geodesy';
import { imageToGeo, type Georeference, type ImagePoint } from './hunter-map';
import { buildKml, splitIntoTiles, type KmlArea, type OverlayTile } from './kml';
import type { SavedMapImage, Zone } from './schemas/hunter-map';
import { writeZip, type ZipInput } from './zip';

type Fitted = Extract<Georeference, { status: 'ok' }>;

export const JPEG_QUALITY = 0.9;

/** The traced areas on the ground. An area whose corner cannot be placed is left out. */
export function zonesOnGround(fitted: Fitted, zones: readonly Zone[]): KmlArea[] {
  return zones.flatMap((zone) => {
    const ring = zone.points.map((point) => imageToGeo(fitted, point));
    return ring.every((point): point is GeoPoint => point !== null) ? [{ name: zone.name, ring }] : [];
  });
}

export interface KmzResult {
  bytes: Uint8Array<ArrayBuffer>;
  /** Each piece's size in bytes, in the order written. */
  pieces: { name: string; bytes: number }[];
}

export async function buildKmz(
  image: SavedMapImage,
  fitted: Fitted,
  name: string,
  split: number,
  zones: readonly Zone[],
): Promise<KmzResult> {
  const bitmap = await createImageBitmap(new Blob([image.data], { type: image.type }));
  const files: ZipInput[] = [];
  const overlays: OverlayTile[] = [];
  const pieces: { name: string; bytes: number }[] = [];
  const corner = (point: ImagePoint) => {
    const ground = imageToGeo(fitted, point);
    if (!ground) throw new Error('A corner cannot be placed');
    return ground;
  };
  try {
    for (const tile of splitIntoTiles(image.width, image.height, split, split)) {
      const canvas = document.createElement('canvas');
      canvas.width = tile.width;
      canvas.height = tile.height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('No 2D canvas');
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, tile.width, tile.height);
      context.drawImage(bitmap, tile.x, tile.y, tile.width, tile.height, 0, 0, tile.width, tile.height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
      if (!blob) throw new Error('A piece could not be encoded');
      const file = split === 1 ? 'files/map.jpg' : `files/map_${tile.row + 1}_${tile.column + 1}.jpg`;
      files.push({ name: file, data: new Uint8Array(await blob.arrayBuffer()) });
      pieces.push({ name: file, bytes: blob.size });
      overlays.push({
        name: split === 1 ? name : `${name} ${tile.row + 1}-${tile.column + 1}`,
        href: file,
        corners: {
          lowerLeft: corner({ x: tile.x, y: tile.y + tile.height }),
          lowerRight: corner({ x: tile.x + tile.width, y: tile.y + tile.height }),
          upperRight: corner({ x: tile.x + tile.width, y: tile.y }),
          upperLeft: corner({ x: tile.x, y: tile.y }),
        },
      });
    }
  } finally {
    bitmap.close();
  }
  const kml = new TextEncoder().encode(buildKml(name, overlays, zonesOnGround(fitted, zones)));
  // The KML comes first: some apps read only the first entry of a KMZ.
  return { bytes: writeZip([{ name: 'doc.kml', data: kml }, ...files]), pieces };
}

export function buildAreasKml(fitted: Fitted, name: string, zones: readonly Zone[]): string {
  return buildKml(name, [], zonesOnGround(fitted, zones));
}

/** Offers bytes to the reader as a file download. */
export function download(data: BlobPart, filename: string, type: string): void {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
