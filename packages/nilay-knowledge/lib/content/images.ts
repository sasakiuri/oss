// cspell:ignore turbopack
import { realpath, stat } from 'node:fs/promises';
import path from 'node:path';

import sharp from 'sharp';

export interface ImageDimensions {
  width: number;
  height: number;
}

export type ImageDimensionsResolver = (src: string) => Promise<ImageDimensions | null>;

function isWithin(directory: string, filename: string): boolean {
  const relative = path.relative(directory, filename);
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

/** Read only published content assets. External and missing images keep their existing browser behavior. */
export function createImageDimensionsResolver(publicContentDirectory: string): ImageDimensionsResolver {
  const directory = path.resolve(publicContentDirectory);

  return async (src) => {
    if (!src.startsWith('/content/')) return null;
    let pathname: string;
    try {
      pathname = decodeURIComponent(src.split(/[?#]/, 1)[0]!);
    } catch (error) {
      throw new Error(`Invalid content image URL: ${src}`, { cause: error });
    }
    if (pathname.includes('\\') || pathname.includes('\0') || pathname.split('/').includes('..')) {
      throw new Error(`Content image path must stay within public/content: ${src}`);
    }
    const filename = path.resolve(directory, `.${pathname.slice('/content'.length)}`);
    if (!isWithin(directory, filename)) {
      throw new Error(`Content image path must stay within public/content: ${src}`);
    }

    try {
      // Next serves public assets separately; do not trace their dynamic paths into the server bundle.
      const [realDirectory, realFilename] = await Promise.all([
        realpath(directory),
        realpath(/* turbopackIgnore: true */ filename),
      ]);
      if (!isWithin(realDirectory, realFilename)) {
        throw new Error('Image symlink must stay within public/content');
      }
      if (!(await stat(realFilename)).isFile()) throw new Error('Content image must be a regular file');
      const { autoOrient } = await sharp(realFilename).metadata();
      if (!(autoOrient.width > 0 && autoOrient.height > 0)) throw new Error('Image has no intrinsic dimensions');
      return { width: autoOrient.width, height: autoOrient.height };
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') return null;
      throw new Error(`Unable to read content image: ${src}: ${String(error)}`, { cause: error });
    }
  };
}
