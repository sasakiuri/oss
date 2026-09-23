import type { TargetPaper, TargetPrintOptions } from './schemas/home-target';

export type { TargetPaper } from './schemas/home-target';

// Preview and PDF share millimetre coordinates with the origin at top left.
export function getTargetLayout(diameter: number, paper: TargetPaper, options: TargetPrintOptions = { copies: 1 }) {
  const columns = options.copies >= 4 ? 2 : 1;
  const rows = options.copies / columns;
  const footer = options.conditions ? 74 : 60;
  const width =
    paper === 'a4'
      ? 210
      : paper === 'letter'
        ? 215.9
        : Math.max(options.conditions ? 110 : 70, columns * diameter + (columns - 1) * 10 + 20);
  const height = paper === 'a4' ? 297 : paper === 'letter' ? 279.4 : rows * diameter + (rows - 1) * 10 + footer;
  const cellWidth = (width - 20 - (columns - 1) * 10) / columns;
  const cellHeight = (height - footer - (rows - 1) * 10) / rows;
  const centers = Array.from({ length: options.copies }, (_, index) => ({
    x: 10 + cellWidth / 2 + (index % columns) * (cellWidth + 10),
    y: 20 + cellHeight / 2 + Math.floor(index / columns) * (cellHeight + 10),
  }));
  const number = (value: number) =>
    Math.abs(value) >= 100000 ? value.toExponential(2) : String(Number(value.toFixed(2)));
  const labels = options.conditions
    ? [
        `Eye: ${number(options.conditions.eyeCm)} cm   Distance: ${number(options.conditions.distanceCm / 100)} m`,
        `Center: ${number(options.conditions.heightCm)} cm   Diameter: ${number(diameter / 10)} cm`,
      ]
    : [];
  return {
    width,
    height,
    diameter,
    centers,
    labels,
    centerX: 10 + cellWidth / 2,
    centerY: 20 + cellHeight / 2,
    rulerX: (width - 50) / 2,
    rulerY: height - 20,
    fits: Number.isFinite(diameter) && diameter > 0 && diameter <= Math.min(cellWidth, cellHeight),
  };
}
