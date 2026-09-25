/**
 * A PDF whose pages are JPEG pictures placed at an exact size in millimetres. Used where the page
 * holds Japanese text: the picture is drawn by the browser with its own fonts, so no font has to be
 * embedded, and the page size fixes the scale regardless of the print dialog's defaults.
 */

export interface ImagePdfPage {
  jpeg: Uint8Array;
  widthPx: number;
  heightPx: number;
}

const pt = (mm: number) => (mm / 25.4) * 72;
const n = (value: number) => value.toFixed(4);

export function buildImagePdf(
  pages: readonly ImagePdfPage[],
  pageMm: { width: number; height: number },
  title: string,
): Uint8Array {
  if (pages.length === 0) throw new Error('A PDF needs at least one page');
  const encoder = new TextEncoder();
  const width = pt(pageMm.width);
  const height = pt(pageMm.height);
  // Objects: 1 catalog, 2 pages, 3 info, then per page: page, contents, image.
  const pageIds = pages.map((_, index) => 4 + index * 3);
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (data: string | Uint8Array) => {
    const bytes = typeof data === 'string' ? encoder.encode(data) : data;
    chunks.push(bytes);
    length += bytes.length;
  };
  const object = (id: number, body: () => void) => {
    offsets[id] = length;
    push(`${id} 0 obj\n`);
    body();
    push('\nendobj\n');
  };
  // The header's binary comment tells tools the file holds binary data.
  push('%PDF-1.7\n%âãÏÓ\n');
  object(1, () => push('<< /Type /Catalog /Pages 2 0 R >>'));
  object(2, () =>
    push(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`),
  );
  // Only ASCII is written into the title, so it needs no encoding.
  object(3, () =>
    push(`<< /Title (${title.replace(/[^\x20-\x7e]/g, '').replace(/[()\\]/g, '')}) /Producer (Nilay Labs) >>`),
  );
  pages.forEach((page, index) => {
    const id = pageIds[index]!;
    const content = `q ${n(width)} 0 0 ${n(height)} 0 0 cm /Im0 Do Q`;
    object(id, () =>
      push(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${n(width)} ${n(height)}] /Resources << /XObject << /Im0 ${id + 2} 0 R >> >> /Contents ${id + 1} 0 R >>`,
      ),
    );
    object(id + 1, () => push(`<< /Length ${encoder.encode(content).length} >>\nstream\n${content}\nendstream`));
    object(id + 2, () => {
      push(
        `<< /Type /XObject /Subtype /Image /Width ${page.widthPx} /Height ${page.heightPx} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.jpeg.length} >>\nstream\n`,
      );
      push(page.jpeg);
      push('\nendstream');
    });
  });
  const size = 4 + pages.length * 3;
  const xref = length;
  push(`xref\n0 ${size}\n0000000000 65535 f \n`);
  for (let id = 1; id < size; id += 1) push(`${String(offsets[id]).padStart(10, '0')} 00000 n \n`);
  push(`trailer\n<< /Size ${size} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  const pdf = new Uint8Array(length);
  let at = 0;
  for (const chunk of chunks) {
    pdf.set(chunk, at);
    at += chunk.length;
  }
  return pdf;
}
