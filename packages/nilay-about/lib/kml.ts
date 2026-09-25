/**
 * KML (OGC 07-147r2) for taking a georeferenced map picture and traced areas to other map apps.
 *
 * A picture goes in as a GroundOverlay whose four corners are given with gx:LatLonQuad (Google's
 * extension), which an affine fit needs: the picture may be turned or sheared, so a north-up
 * LatLonBox would misplace it. The corners are listed counter-clockwise from the lower left, as
 * the extension requires. Areas go in as Placemark polygons.
 */

import type { GeoPoint } from './geodesy';

export interface OverlayTile {
  name: string;
  /** The picture's path inside the KMZ. */
  href: string;
  corners: { lowerLeft: GeoPoint; lowerRight: GeoPoint; upperRight: GeoPoint; upperLeft: GeoPoint };
}

export interface KmlArea {
  name: string;
  ring: readonly GeoPoint[];
}

const escape = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const coordinate = (point: GeoPoint) => `${point.longitude.toFixed(8)},${point.latitude.toFixed(8)}`;

export function buildKml(name: string, overlays: readonly OverlayTile[], areas: readonly KmlArea[]): string {
  const overlayXml = overlays.map(
    (tile) => `    <GroundOverlay>
      <name>${escape(tile.name)}</name>
      <Icon><href>${escape(tile.href)}</href></Icon>
      <gx:LatLonQuad>
        <coordinates>${[tile.corners.lowerLeft, tile.corners.lowerRight, tile.corners.upperRight, tile.corners.upperLeft].map(coordinate).join(' ')}</coordinates>
      </gx:LatLonQuad>
    </GroundOverlay>`,
  );
  const areaXml = areas.map((area) => {
    const ring = [...area.ring, area.ring[0]!].map((point) => `${coordinate(point)},0`).join(' ');
    return `    <Placemark>
      <name>${escape(area.name)}</name>
      <styleUrl>#area</styleUrl>
      <Polygon>
        <outerBoundaryIs><LinearRing><coordinates>${ring}</coordinates></LinearRing></outerBoundaryIs>
      </Polygon>
    </Placemark>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:gx="http://www.google.com/kml/ext/2.2">
  <Document>
    <name>${escape(name)}</name>
    <Style id="area">
      <LineStyle><color>ff1e26b3</color><width>2</width></LineStyle>
      <PolyStyle><color>401e26b3</color></PolyStyle>
    </Style>
${[...overlayXml, ...areaXml].join('\n')}
  </Document>
</kml>
`;
}

export interface TileRect {
  column: number;
  row: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A picture cut into `columns` × `rows` pieces, in whole pixels, row by row from the top left. */
export function splitIntoTiles(width: number, height: number, columns: number, rows: number): TileRect[] {
  const edges = (size: number, parts: number) =>
    Array.from({ length: parts + 1 }, (_, index) => Math.round((size * index) / parts));
  const xs = edges(width, columns);
  const ys = edges(height, rows);
  const tiles: TileRect[] = [];
  for (let row = 0; row < rows; row += 1)
    for (let column = 0; column < columns; column += 1)
      tiles.push({
        column,
        row,
        x: xs[column]!,
        y: ys[row]!,
        width: xs[column + 1]! - xs[column]!,
        height: ys[row + 1]! - ys[row]!,
      });
  return tiles;
}
