/**
 * The Geospatial Information Authority of Japan's map tiles (地理院タイル), and the Web Mercator
 * arithmetic that places them.
 *
 * GSI allows its tiles to be read in real time by a website with no application, provided the
 * source is shown as 「地理院タイル」 (or 「国土地理院」) linked to the tile list page
 * (https://maps.gsi.go.jp/development/ichiran.html, checked 2026-09-24). Tiles are only ever
 * fetched for the view on screen; nothing is downloaded ahead for use offline.
 *
 * Only the zoom levels made from GSI's own survey data are used: the standard and pale maps from
 * level 5 and the photographs from level 14. The standard and pale maps below level 5 come from
 * other sources with their own credits, so the maps never zoom out that far.
 */

import type { GeoPoint } from './geodesy';

export type BaseLayerId = 'std' | 'pale' | 'photo';

export interface BaseLayer {
  id: BaseLayerId;
  name: { ja: string; en: string };
  url: (z: number, x: number, y: number) => string;
  minZoom: number;
  maxZoom: number;
}

export const gsiTileListUrl = 'https://maps.gsi.go.jp/development/ichiran.html';
export const gsiTileHost = 'https://cyberjapandata.gsi.go.jp';
export const gsiTilesCheckedOn = '2026-09-24';

export const baseLayers: Record<BaseLayerId, BaseLayer> = {
  std: {
    id: 'std',
    name: { ja: '標準地図', en: 'Standard' },
    url: (z, x, y) => `${gsiTileHost}/xyz/std/${z}/${x}/${y}.png`,
    minZoom: 5,
    maxZoom: 18,
  },
  pale: {
    id: 'pale',
    name: { ja: '淡色地図', en: 'Pale' },
    url: (z, x, y) => `${gsiTileHost}/xyz/pale/${z}/${x}/${y}.png`,
    minZoom: 5,
    maxZoom: 18,
  },
  photo: {
    id: 'photo',
    name: { ja: '写真', en: 'Photo' },
    url: (z, x, y) => `${gsiTileHost}/xyz/seamlessphoto/${z}/${x}/${y}.jpg`,
    minZoom: 14,
    maxZoom: 18,
  },
};

export const TILE_SIZE = 256;
/** The map never zooms out past the lowest level the base maps come from GSI's own data. */
export const MIN_MAP_ZOOM = 5;
export const MAX_MAP_ZOOM = 18;
/** Web Mercator stops here, where the square world map ends. */
export const MAX_MERCATOR_LATITUDE = 85.0511287798;

const degrees = Math.PI / 180;

/** Pixels from the top left of the world map at `zoom`; `zoom` may be fractional. */
export function toWorld(point: GeoPoint, zoom: number): { x: number; y: number } {
  const size = TILE_SIZE * 2 ** zoom;
  const latitude = Math.max(-MAX_MERCATOR_LATITUDE, Math.min(MAX_MERCATOR_LATITUDE, point.latitude)) * degrees;
  return {
    x: ((point.longitude + 180) / 360) * size,
    y: (0.5 - Math.log(Math.tan(Math.PI / 4 + latitude / 2)) / (2 * Math.PI)) * size,
  };
}

export function fromWorld(world: { x: number; y: number }, zoom: number): GeoPoint {
  const size = TILE_SIZE * 2 ** zoom;
  const longitude = (world.x / size) * 360 - 180;
  const latitude = (2 * Math.atan(Math.exp(Math.PI * (1 - (2 * world.y) / size))) - Math.PI / 2) / degrees;
  return { latitude, longitude };
}

/** Ground metres covered by one screen pixel at a latitude, on the WGS84 equatorial radius. */
export function metresPerPixel(latitude: number, zoom: number): number {
  return (2 * Math.PI * 6378137 * Math.cos(latitude * degrees)) / (TILE_SIZE * 2 ** zoom);
}

export interface TilePlacement {
  key: string;
  url: string;
  left: number;
  top: number;
  size: number;
}

/**
 * The tiles that cover a view of `width` × `height` screen pixels centred on `center` at `zoom`,
 * each with where it goes on screen. Tiles come from the nearest whole level the layer has and are
 * scaled to the fractional zoom. Returns nothing when the view is further out than the layer serves.
 */
export function tilesForView(
  layer: BaseLayer,
  center: GeoPoint,
  zoom: number,
  width: number,
  height: number,
): TilePlacement[] {
  if (width <= 0 || height <= 0) return [];
  const tileZoom = Math.min(layer.maxZoom, Math.round(zoom));
  // A layer is not stretched more than one level out: its tiles would multiply fourfold per level.
  if (tileZoom < layer.minZoom || zoom < layer.minZoom - 1) return [];
  const scale = 2 ** (zoom - tileZoom);
  const size = TILE_SIZE * scale;
  const centre = toWorld(center, zoom);
  const left = centre.x - width / 2;
  const top = centre.y - height / 2;
  const count = 2 ** tileZoom;
  const first = { x: Math.floor(left / size), y: Math.max(0, Math.floor(top / size)) };
  const last = { x: Math.floor((left + width) / size), y: Math.min(count - 1, Math.floor((top + height) / size)) };
  const tiles: TilePlacement[] = [];
  for (let y = first.y; y <= last.y; y += 1) {
    for (let x = first.x; x <= last.x; x += 1) {
      // Wrap across the antimeridian so a view that crosses it still has tiles on both sides.
      const wrapped = ((x % count) + count) % count;
      tiles.push({
        key: `${layer.id}/${tileZoom}/${x}/${y}`,
        url: layer.url(tileZoom, wrapped, y),
        left: x * size - left,
        top: y * size - top,
        size,
      });
    }
  }
  return tiles;
}

/**
 * The centre and zoom that fit a set of points into a view, leaving `padding` pixels at the edges.
 * One point, or points at one place, are shown at `singleZoom`.
 */
export function fitView(
  points: readonly GeoPoint[],
  width: number,
  height: number,
  padding = 32,
  singleZoom = 15,
): { center: GeoPoint; zoom: number } | null {
  if (points.length === 0) return null;
  const world = points.map((point) => toWorld(point, 0));
  const minX = Math.min(...world.map((p) => p.x));
  const maxX = Math.max(...world.map((p) => p.x));
  const minY = Math.min(...world.map((p) => p.y));
  const maxY = Math.max(...world.map((p) => p.y));
  const center = fromWorld({ x: (minX + maxX) / 2, y: (minY + maxY) / 2 }, 0);
  const spanX = maxX - minX;
  const spanY = maxY - minY;
  if (spanX === 0 && spanY === 0) return { center, zoom: clampZoom(singleZoom) };
  const usableWidth = Math.max(1, width - 2 * padding);
  const usableHeight = Math.max(1, height - 2 * padding);
  const zoom = Math.log2(
    Math.min(spanX > 0 ? usableWidth / spanX : Infinity, spanY > 0 ? usableHeight / spanY : Infinity),
  );
  return { center, zoom: clampZoom(Math.min(zoom, MAX_MAP_ZOOM)) };
}

export function clampZoom(zoom: number): number {
  return Math.max(MIN_MAP_ZOOM, Math.min(MAX_MAP_ZOOM, zoom));
}
