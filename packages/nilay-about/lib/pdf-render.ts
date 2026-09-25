/**
 * Turning a page of a PDF into a picture, in the browser, with Mozilla's PDF.js (Apache-2.0).
 *
 * Prefectures publish their protected-area maps as PDFs. The hunter map works on pictures, so the
 * chosen page is drawn on a canvas at a size the reader picks and kept as a PNG. Nothing is sent:
 * PDF.js reads the bytes it is given, in a worker served from this site.
 *
 * PDF.js is loaded only when a PDF is chosen, so it costs nothing to a reader who never picks one.
 */

/** Browsers refuse canvases much beyond this many pixels (iOS Safari's limit is 16,777,216). */
export const MAX_CANVAS_PIXELS = 16_000_000;

export interface PdfPageSize {
  /** In PDF points (1/72 inch). */
  width: number;
  height: number;
}

export interface OpenedPdf {
  pageCount: number;
  pageSize: (pageNumber: number) => Promise<PdfPageSize>;
  /** Draws a page with its longer side at `longSide` pixels (less if the canvas limit says so). */
  renderPage: (pageNumber: number, longSide: number) => Promise<{ blob: Blob; width: number; height: number }>;
  close: () => Promise<void>;
}

/** The pixel size a page comes out at for a requested longer side, within the canvas limit. */
export function renderSize(page: PdfPageSize, longSide: number): { width: number; height: number; scale: number } {
  let scale = longSide / Math.max(page.width, page.height);
  const area = page.width * page.height * scale * scale;
  if (area > MAX_CANVAS_PIXELS) scale *= Math.sqrt(MAX_CANVAS_PIXELS / area);
  return { width: Math.floor(page.width * scale), height: Math.floor(page.height * scale), scale };
}

export async function openPdf(data: ArrayBuffer): Promise<OpenedPdf> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
  // A copy: PDF.js transfers the buffer to its worker, and the caller may still hold the original.
  const task = pdfjs.getDocument({ data: new Uint8Array(data.slice(0)) });
  const document = await task.promise;
  const pageSize = async (pageNumber: number) => {
    const page = await document.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    return { width: viewport.width, height: viewport.height };
  };
  return {
    pageCount: document.numPages,
    pageSize,
    renderPage: async (pageNumber, longSide) => {
      const page = await document.getPage(pageNumber);
      const base = page.getViewport({ scale: 1 });
      const size = renderSize({ width: base.width, height: base.height }, longSide);
      const viewport = page.getViewport({ scale: size.scale });
      const canvas = globalThis.document.createElement('canvas');
      canvas.width = size.width;
      canvas.height = size.height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('No 2D canvas');
      // A white sheet under the page, as it prints: PDF pages are transparent where nothing is drawn.
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, size.width, size.height);
      await page.render({ canvas, canvasContext: context, viewport }).promise;
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      canvas.width = 0;
      canvas.height = 0;
      if (!blob) throw new Error('The page could not be encoded');
      return { blob, width: size.width, height: size.height };
    },
    close: () => task.destroy(),
  };
}
