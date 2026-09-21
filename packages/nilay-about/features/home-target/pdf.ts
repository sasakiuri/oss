import { MAX_TARGET_DIAMETER_CM } from './model';

/** Generate a single-page PDF. Cross-reference offsets and stream sizes are byte counts. */
export function generateTargetPdf(blackAreaSizeMm: number): Uint8Array {
  if (!Number.isFinite(blackAreaSizeMm) || blackAreaSizeMm <= 0 || blackAreaSizeMm > MAX_TARGET_DIAMETER_CM * 10) {
    throw new RangeError('Target diameter must be greater than 0mm and at most 1000mm');
  }
  const paperSizePt = ((blackAreaSizeMm * 1.2) / 25.4) * 72;
  const radius = (blackAreaSizeMm / 2 / 25.4) * 72;
  const content = generateCircleContent(paperSizePt / 2, paperSizePt / 2, radius);
  const encoder = new TextEncoder();
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${paperSizePt.toFixed(6)} ${paperSizePt.toFixed(6)}] /Resources << >> /Contents 4 0 R >>`,
    `<< /Length ${encoder.encode(content).byteLength} >>\nstream\n${content}\nendstream`,
    '<< /Title (Home Target) /Author (Nilay Sport) >>',
  ];

  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  function append(value: string) {
    const bytes = encoder.encode(value);
    chunks.push(bytes);
    byteLength += bytes.byteLength;
  }

  append('%PDF-1.7\n%\xFF\xFF\xFF\xFF\n');
  const offsets = objects.map((object, index) => {
    const offset = byteLength;
    append(`${index + 1} 0 obj\n${object}\nendobj\n`);
    return offset;
  });
  const xrefStart = byteLength;
  append(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`);
  for (const offset of offsets) append(`${String(offset).padStart(10, '0')} 00000 n \n`);
  append(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 5 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`);

  const pdf = new Uint8Array(byteLength);
  let cursor = 0;
  for (const chunk of chunks) {
    pdf.set(chunk, cursor);
    cursor += chunk.byteLength;
  }
  return pdf;
}

function generateCircleContent(cx: number, cy: number, r: number): string {
  // Bezier curve control point factor for circle approximation
  // k = 4 * (sqrt(2) - 1) / 3 ≈ 0.5522847498
  const k = 0.5522847498;

  const lines: string[] = [];

  // Set fill color to black
  lines.push('0 0 0 rg');

  // Move to starting point (right side of circle)
  lines.push(`${(cx + r).toFixed(4)} ${cy.toFixed(4)} m`);

  // Draw 4 Bezier curves to form a circle
  // Top-right quadrant
  lines.push(
    `${(cx + r).toFixed(4)} ${(cy + r * k).toFixed(4)} ${(cx + r * k).toFixed(4)} ${(cy + r).toFixed(4)} ${cx.toFixed(4)} ${(cy + r).toFixed(4)} c`,
  );
  // Top-left quadrant
  lines.push(
    `${(cx - r * k).toFixed(4)} ${(cy + r).toFixed(4)} ${(cx - r).toFixed(4)} ${(cy + r * k).toFixed(4)} ${(cx - r).toFixed(4)} ${cy.toFixed(4)} c`,
  );
  // Bottom-left quadrant
  lines.push(
    `${(cx - r).toFixed(4)} ${(cy - r * k).toFixed(4)} ${(cx - r * k).toFixed(4)} ${(cy - r).toFixed(4)} ${cx.toFixed(4)} ${(cy - r).toFixed(4)} c`,
  );
  // Bottom-right quadrant
  lines.push(
    `${(cx + r * k).toFixed(4)} ${(cy - r).toFixed(4)} ${(cx + r).toFixed(4)} ${(cy - r * k).toFixed(4)} ${(cx + r).toFixed(4)} ${cy.toFixed(4)} c`,
  );

  // Fill the path
  lines.push('f');

  return lines.join('\n');
}
