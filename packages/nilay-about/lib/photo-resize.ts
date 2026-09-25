import { PHOTO_JPEG_QUALITY, PHOTO_MAX_EDGE } from '@/lib/schemas/photos';

/** The size a picture is drawn at so its longer side fits `maxEdge`. A smaller picture keeps its size. */
export function fitWithin(width: number, height: number, maxEdge: number): { width: number; height: number } {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

function decode(file: Blob): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image.naturalWidth > 0 && image.naturalHeight > 0 ? image : null);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    image.src = url;
  });
}

/**
 * A picture the reader chose, redrawn to fit `PHOTO_MAX_EDGE` and encoded as JPEG.
 *
 * The browser turns the picture upright from its orientation tag as it decodes it, so the redrawn
 * picture is the way up it was taken. Nothing else of the file survives: the position and the camera
 * details in its metadata are not copied. Null when the browser cannot read the file as a picture.
 */
export async function preparePhoto(
  file: Blob,
  maxEdge = PHOTO_MAX_EDGE,
): Promise<{ data: ArrayBuffer; width: number; height: number } | null> {
  const image = await decode(file);
  if (!image) return null;
  const size = fitWithin(image.naturalWidth, image.naturalHeight, maxEdge);
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext('2d');
  if (!context) return null;
  // JPEG has no transparency; a transparent picture would otherwise turn black behind it.
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, size.width, size.height);
  context.drawImage(image, 0, 0, size.width, size.height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', PHOTO_JPEG_QUALITY));
  if (!blob) return null;
  return { data: await blob.arrayBuffer(), ...size };
}
