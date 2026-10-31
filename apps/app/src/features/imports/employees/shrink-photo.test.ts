import { afterEach, describe, expect, it, vi } from 'vitest';

import type { SelectedFile } from '../upload-selection';
import { maxPhotoEdge, shrinkPhoto, shrinkSelected } from './shrink-photo';

const drawn: { width: number; height: number }[] = [];
const painted: string[] = [];
const canvases: { width: number; height: number }[] = [];

function stubCanvas(
  bitmap: { width: number; height: number } | Error,
  outputBytes = 100,
  withContext = true
) {
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async (_blob: Blob, options: ImageBitmapOptions) => {
      expect(options).toEqual({ imageOrientation: 'from-image' });
      if (bitmap instanceof Error) throw bitmap;
      return { ...bitmap, close: vi.fn() };
    })
  );
  vi.stubGlobal(
    'OffscreenCanvas',
    class {
      constructor(
        public width: number,
        public height: number
      ) {
        drawn.push({ width, height });
        canvases.push(this);
      }
      getContext() {
        if (!withContext) return null;
        return {
          set fillStyle(color: string) {
            painted.push(`fill ${color}`);
          },
          fillRect: () => painted.push('fillRect'),
          drawImage: () => painted.push('drawImage'),
        };
      }
      convertToBlob(options: ImageEncodeOptions) {
        expect(options).toEqual({ type: 'image/jpeg', quality: 0.85 });
        return Promise.resolve(new Blob([new Uint8Array(outputBytes)], { type: 'image/jpeg' }));
      }
    }
  );
}

const photo = (bytes: number, type = 'image/jpeg') => new Blob([new Uint8Array(bytes)], { type });

afterEach(() => {
  vi.unstubAllGlobals();
  drawn.length = 0;
  painted.length = 0;
  canvases.length = 0;
});

describe('shrinking a photograph before it is uploaded', () => {
  it('draws a large one at 2000 pixels on its long edge, as a JPEG', async () => {
    stubCanvas({ width: 3000, height: 4000 });
    const shrunk = await shrinkPhoto(photo(5000), 'image/jpeg');
    expect(shrunk?.type).toBe('image/jpeg');
    expect(drawn).toEqual([{ width: 1500, height: maxPhotoEdge }]);
  });

  it('leaves a small JPEG, a HEIC, an unreadable photo and a larger result as they are', async () => {
    stubCanvas({ width: 1600, height: 1200 });
    expect(await shrinkPhoto(photo(5000), 'image/jpeg')).toBeNull();
    expect(await shrinkPhoto(photo(5000, 'image/heic'), 'image/heic')).toBeNull();
    stubCanvas(new Error('cannot decode'));
    expect(await shrinkPhoto(photo(5000), 'image/jpeg')).toBeNull();
    stubCanvas({ width: 4000, height: 3000 }, 9000);
    expect(await shrinkPhoto(photo(5000), 'image/jpeg')).toBeNull();
  });

  it('keeps the original where the browser gives no canvas to draw on', async () => {
    stubCanvas({ width: 3000, height: 4000 }, 100, false);
    expect(await shrinkPhoto(photo(5000), 'image/jpeg')).toBeNull();
    expect(canvases).toEqual([{ width: 0, height: 0 }]);
  });

  it('paints a transparent PNG on white, and frees the canvas once encoded', async () => {
    stubCanvas({ width: 1200, height: 900 });
    expect(await shrinkPhoto(photo(5000, 'image/png'), 'image/png')).not.toBeNull();
    expect(painted).toEqual(['fill #fff', 'fillRect', 'drawImage']);
    expect(canvases).toEqual([{ width: 0, height: 0 }]);
  });

  it('turns a PNG into a JPEG under a name of its own', async () => {
    stubCanvas({ width: 1200, height: 900 });
    const file: SelectedFile = {
      key: 'k',
      path: 'fise/scan.png',
      name: 'scan.png',
      blob: photo(5000, 'image/png'),
      size: 5000,
      mimeType: 'image/png',
      group: 'fise',
      pages: 1,
    };
    const shrunk = await shrinkSelected(file, new Set(['fise/scan.png', 'fise/scan.jpg']));
    expect(shrunk).toMatchObject({
      path: 'fise/scan (2).jpg',
      name: 'scan (2).jpg',
      mimeType: 'image/jpeg',
      size: 100,
      group: 'fise',
    });
  });
});
