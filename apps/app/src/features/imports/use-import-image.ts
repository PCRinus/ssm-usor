import { getGetImportSourceQueryKey, useGetImportSource } from '@/api/generated/api';
import { useApi } from '@/api/use-api';

export type ImportImageFile = {
  uploadPath: string;
  mimeType: string;
  hasDerived: boolean;
};

export const isHeic = (mimeType: string) => mimeType === 'image/heic' || mimeType === 'image/heif';

// The links last five minutes; the query is fetched again before they expire.
const linkLifetimeMs = 4 * 60_000;

// A photograph is shown through the JPEG the import makes of it, a fraction of the original's
// size. A HEIC only through it: most browsers cannot draw HEIC.
export function useImportImage(importId: string, file: ImportImageFile) {
  const { request } = useApi();
  const image = file.mimeType.startsWith('image/');
  const drawable = image && (!isHeic(file.mimeType) || file.hasDerived);
  const params = { file: file.uploadPath };
  const source = useGetImportSource(importId, params, {
    request,
    query: {
      queryKey: getGetImportSourceQueryKey(importId, params),
      enabled: drawable,
      staleTime: linkLifetimeMs,
      refetchInterval: drawable ? linkLifetimeMs : false,
    },
  });
  const url = isHeic(file.mimeType)
    ? source.data?.derived?.url
    : (source.data?.derived?.url ?? source.data?.original.url);
  return { image, drawable, url, failed: source.isError };
}
