import type { ImagePdfPage } from '@/lib/image-pdf';

/** Resolution of the pictures in the PDF: fine enough that 10 mm characters print cleanly. */
export const PDF_DPI = 300;

/**
 * Draws a real-size SVG sheet into a JPEG at PDF_DPI. The browser lays out the text with the fonts
 * it has, the same ones the preview uses.
 */
export async function rasterizeSheet(svg: SVGSVGElement, widthMm: number, heightMm: number): Promise<ImagePdfPage> {
  const widthPx = Math.round((widthMm / 25.4) * PDF_DPI);
  const heightPx = Math.round((heightMm / 25.4) * PDF_DPI);
  const copy = svg.cloneNode(true) as SVGSVGElement;
  copy.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  copy.setAttribute('width', String(widthPx));
  copy.setAttribute('height', String(heightPx));
  const url = URL.createObjectURL(
    new Blob([new XMLSerializer().serializeToString(copy)], { type: 'image/svg+xml;charset=utf-8' }),
  );
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('The sheet could not be drawn'));
      image.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = widthPx;
    canvas.height = heightPx;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas is not available');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, widthPx, heightPx);
    context.drawImage(image, 0, 0, widthPx, heightPx);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((result) => (result ? resolve(result) : reject(new Error('Not encoded'))), 'image/jpeg', 0.92),
    );
    return { jpeg: new Uint8Array(await blob.arrayBuffer()), widthPx, heightPx };
  } finally {
    URL.revokeObjectURL(url);
  }
}
