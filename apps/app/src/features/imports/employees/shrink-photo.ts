import type { SelectedFile } from '../upload-selection';

// About what the import converts every photograph to (ADR 032): a larger one only costs upload.
export const maxPhotoEdge = 2000;
const jpegQuality = 0.85;

type Context = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

// iOS Safari gives no context past its canvas memory cap, and the blank canvas would still encode
// as a black JPEG smaller than the photograph. Freeing each canvas keeps under that cap.
async function paintAndEncode(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  context: Context | null,
  bitmap: ImageBitmap,
  encodeJpeg: () => Promise<Blob | null>
) {
  try {
    if (!context) return null;
    // A JPEG has no transparency: a PNG's transparent pixels would turn black.
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return await encodeJpeg();
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

function encode(bitmap: ImageBitmap, width: number, height: number): Promise<Blob | null> {
  if (typeof OffscreenCanvas === 'function') {
    const canvas = new OffscreenCanvas(width, height);
    return paintAndEncode(canvas, canvas.getContext('2d'), bitmap, () =>
      canvas.convertToBlob({ type: 'image/jpeg', quality: jpegQuality })
    );
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return paintAndEncode(
    canvas,
    canvas.getContext('2d'),
    bitmap,
    () => new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', jpegQuality))
  );
}

/**
 * A JPEG of at most `maxPhotoEdge` pixels a side, upright as the camera held it, or null where
 * the original goes up as it is: a HEIC (most browsers cannot decode it, the import converts it),
 * a photograph already small, one the browser cannot read, or a result no smaller.
 */
export async function shrinkPhoto(blob: Blob, mimeType: string): Promise<Blob | null> {
  if (mimeType !== 'image/jpeg' && mimeType !== 'image/png') return null;
  if (typeof createImageBitmap !== 'function') return null;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
  } catch {
    return null;
  }
  try {
    const scale = Math.min(1, maxPhotoEdge / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && mimeType === 'image/jpeg') return null;
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const shrunk = await encode(bitmap, width, height);
    return shrunk && shrunk.size > 0 && shrunk.size < blob.size ? shrunk : null;
  } catch {
    return null;
  } finally {
    bitmap.close();
  }
}

function asJpeg(path: string, taken: Set<string>) {
  const stem = path.replace(/\.png$/i, '');
  for (let copy = 1; ; copy += 1) {
    const candidate = copy === 1 ? `${stem}.jpg` : `${stem} (${copy}).jpg`;
    if (!taken.has(candidate)) return candidate;
  }
}

// A PNG becomes a JPEG, whose name the upload checks against its type.
export async function shrinkSelected(
  file: SelectedFile,
  taken: Set<string>
): Promise<SelectedFile> {
  const shrunk = await shrinkPhoto(file.blob, file.mimeType);
  if (!shrunk) return file;
  const path = file.mimeType === 'image/png' ? asJpeg(file.path, taken) : file.path;
  taken.add(path);
  return {
    ...file,
    path,
    name: path.split('/').at(-1) ?? file.name,
    group: file.group === file.path ? path : file.group,
    blob: shrunk,
    size: shrunk.size,
    mimeType: 'image/jpeg',
  };
}
