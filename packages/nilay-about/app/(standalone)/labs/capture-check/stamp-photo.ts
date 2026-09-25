import type { boardLines } from '@/lib/capture-check';

const FONT = "'Noto Sans JP', 'Hiragino Sans', 'Yu Gothic', 'Meiryo', sans-serif";

/**
 * A copy of the photo with the board's lines in a white box at the bottom left, as a JPEG. Drawing
 * on a canvas re-encodes the picture, so the copy carries none of the original's metadata.
 */
export async function stampPhoto(file: Blob, lines: ReturnType<typeof boardLines>): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas is not available');
    context.drawImage(bitmap, 0, 0);
    const size = Math.max(16, Math.round(Math.min(bitmap.width, bitmap.height) / 22));
    const padding = Math.round(size * 0.6);
    context.font = `bold ${size}px ${FONT}`;
    const texts = lines.map((line) => `${line.label}　${line.value}`);
    const width = Math.max(...texts.map((text) => context.measureText(text).width)) + padding * 2;
    const height = texts.length * size * 1.4 + padding * 2;
    const top = bitmap.height - height - padding;
    context.fillStyle = 'rgba(255, 255, 255, 0.9)';
    context.fillRect(padding, top, width, height);
    context.fillStyle = '#000000';
    context.textBaseline = 'top';
    texts.forEach((text, index) => context.fillText(text, padding * 2, top + padding + index * size * 1.4));
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Not encoded'))), 'image/jpeg', 0.92),
    );
  } finally {
    bitmap.close();
  }
}
