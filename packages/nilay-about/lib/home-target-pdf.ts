import { MARKER_CENTRE_MM, MARKER_SIZE_MM, getTargetLayout, type TargetPaper } from './home-target';
import type { TargetPrintOptions } from './schemas/home-target';

export function generateTargetPdf(
  diameterMm: number,
  paper: TargetPaper,
  options: TargetPrintOptions = { copies: 1 },
): Uint8Array {
  const layout = getTargetLayout(diameterMm, paper, options);
  if (!layout.fits) throw new Error('Target does not fit the selected paper');
  const pt = (mm: number) => (mm / 25.4) * 72;
  const r = pt(diameterMm / 2);
  const k = 0.5522847498;
  const n = (value: number) => value.toFixed(4);
  const content = [
    '0 0 0 rg',
    ...layout.centers.flatMap(({ x, y }) => {
      const cx = pt(x);
      const cy = pt(layout.height - y);
      return [
        `${n(cx + r)} ${n(cy)} m`,
        `${n(cx + r)} ${n(cy + r * k)} ${n(cx + r * k)} ${n(cy + r)} ${n(cx)} ${n(cy + r)} c`,
        `${n(cx - r * k)} ${n(cy + r)} ${n(cx - r)} ${n(cy + r * k)} ${n(cx - r)} ${n(cy)} c`,
        `${n(cx - r)} ${n(cy - r * k)} ${n(cx - r * k)} ${n(cy - r)} ${n(cx)} ${n(cy - r)} c`,
        `${n(cx + r * k)} ${n(cy - r)} ${n(cx + r)} ${n(cy - r * k)} ${n(cx + r)} ${n(cy)} c f`,
      ];
    }),
    // Each corner mark is a black square with a white square punched in its middle.
    ...(layout.markers?.centres.flatMap(({ x, y }) => {
      const square = (size: number) =>
        `${n(pt(x - size / 2))} ${n(pt(layout.height - y - size / 2))} ${n(pt(size))} ${n(pt(size))} re f`;
      return ['0 0 0 rg', square(MARKER_SIZE_MM), '1 1 1 rg', square(MARKER_CENTRE_MM), '0 0 0 rg'];
    }) ?? []),
    ...layout.labels.map((label, index) => `BT /F1 8 Tf ${n(pt(10))} ${n(pt(40 - index * 6))} Td (${label}) Tj ET`),
    '0 0 0 RG 0.5 w',
    `${n(pt(layout.rulerX))} ${n(pt(20))} m ${n(pt(layout.rulerX + 50))} ${n(pt(20))} l S`,
    ...Array.from(
      { length: 6 },
      (_, i) => `${n(pt(layout.rulerX + i * 10))} ${n(pt(18))} m ${n(pt(layout.rulerX + i * 10))} ${n(pt(22))} l S`,
    ),
    `BT /F1 8 Tf ${n(pt(layout.rulerX))} ${n(pt(12))} Td (50 mm - Print at 100%) Tj ET`,
  ].join('\n');
  const encoder = new TextEncoder();
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${n(pt(layout.width))} ${n(pt(layout.height))}] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>`,
    `<< /Length ${encoder.encode(content).length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Title (Home Target) /Author (Nilay Sport) >>',
  ];
  let pdf = '%PDF-1.7\n';
  const offsets = objects.map((object, index) => {
    const offset = encoder.encode(pdf).length;
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
    return offset;
  });
  const xref = encoder.encode(pdf).length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 6 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return encoder.encode(pdf);
}
