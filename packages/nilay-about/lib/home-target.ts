import type { TargetPaper, TargetPrintOptions } from './schemas/home-target';

export type { TargetPaper } from './schemas/home-target';

/**
 * The corner marks: a black square with a white one in the middle, so the centre can be tapped on
 * a photo without guessing. Their centres sit this far in from each edge of the sheet, which keeps
 * the whole mark inside the unprintable margin most printers leave (a few millimetres).
 */
export const MARKER_INSET_MM = 12;
export const MARKER_SIZE_MM = 8;
export const MARKER_CENTRE_MM = 2;
/** A custom sheet with marks is at least this wide, so the 50 mm line and its caption clear the bottom marks. */
const MARKER_MIN_WIDTH_MM = 110;

export interface MarkerLayout {
  /** Centres of the four marks in reading order round the sheet: top left, top right, bottom right, bottom left. */
  centres: [{ x: number; y: number }, { x: number; y: number }, { x: number; y: number }, { x: number; y: number }];
  /** Centre to centre, across and down, as printed on the sheet. */
  spacing: { width: number; height: number };
}

export function getMarkerLayout(width: number, height: number): MarkerLayout {
  const left = MARKER_INSET_MM;
  const right = width - MARKER_INSET_MM;
  const top = MARKER_INSET_MM;
  const bottom = height - MARKER_INSET_MM;
  return {
    centres: [
      { x: left, y: top },
      { x: right, y: top },
      { x: right, y: bottom },
      { x: left, y: bottom },
    ],
    spacing: { width: right - left, height: bottom - top },
  };
}

// Preview and PDF share millimetre coordinates with the origin at top left.
export function getTargetLayout(diameter: number, paper: TargetPaper, options: TargetPrintOptions = { copies: 1 }) {
  const columns = options.copies >= 4 ? 2 : 1;
  const rows = options.copies / columns;
  const footer = options.conditions ? 74 : 60;
  const minimumWidth = Math.max(options.conditions ? 110 : 70, options.markers ? MARKER_MIN_WIDTH_MM : 0);
  const width =
    paper === 'a4'
      ? 210
      : paper === 'letter'
        ? 215.9
        : Math.max(minimumWidth, columns * diameter + (columns - 1) * 10 + 20);
  const height = paper === 'a4' ? 297 : paper === 'letter' ? 279.4 : rows * diameter + (rows - 1) * 10 + footer;
  const cellWidth = (width - 20 - (columns - 1) * 10) / columns;
  const cellHeight = (height - footer - (rows - 1) * 10) / rows;
  const centers = Array.from({ length: options.copies }, (_, index) => ({
    x: 10 + cellWidth / 2 + (index % columns) * (cellWidth + 10),
    y: 20 + cellHeight / 2 + Math.floor(index / columns) * (cellHeight + 10),
  }));
  const number = (value: number) =>
    Math.abs(value) >= 100000 ? value.toExponential(2) : String(Number(value.toFixed(2)));
  const markers = options.markers ? getMarkerLayout(width, height) : null;
  const labels = [
    ...(options.conditions
      ? [
          `Eye: ${number(options.conditions.eyeCm)} cm   Distance: ${number(options.conditions.distanceCm / 100)} m`,
          `Center: ${number(options.conditions.heightCm)} cm   Diameter: ${number(diameter / 10)} cm`,
        ]
      : []),
    // The spacing goes on the sheet, so a photo of it carries the numbers that correct it.
    ...(markers ? [`Marker centres: ${number(markers.spacing.width)} x ${number(markers.spacing.height)} mm`] : []),
  ];
  return {
    width,
    height,
    diameter,
    centers,
    labels,
    markers,
    centerX: 10 + cellWidth / 2,
    centerY: 20 + cellHeight / 2,
    rulerX: (width - 50) / 2,
    rulerY: height - 20,
    fits: Number.isFinite(diameter) && diameter > 0 && diameter <= Math.min(cellWidth, cellHeight),
  };
}
