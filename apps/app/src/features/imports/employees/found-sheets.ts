import { useRouteContext } from '@tanstack/react-router';

import {
  type FoundSheetsResponse,
  getGetClientFileDownloadQueryKey,
  getListFoundSheetsQueryKey,
  useGetClientFileDownload,
  useListFoundSheets,
} from '@/api/generated/api';
import { useAuth } from '@/features/auth/auth-context';

export type FoundSheet = FoundSheetsResponse['items'][number]['sheets'][number];
export type FoundBatch = FoundSheetsResponse['items'][number];

export function useFoundSheets(clientId: string, enabled = true) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const { session } = useAuth();
  return useListFoundSheets(clientId, {
    request: apiRequest,
    query: {
      queryKey: [...getListFoundSheetsQueryKey(clientId), session?.user.id],
      enabled: enabled && Boolean(session && apiRequest.baseUrl),
    },
  });
}

const dayMonth = new Intl.DateTimeFormat('ro-RO', { day: 'numeric', month: 'short' });

export const foundOn = (batch: Pick<FoundBatch, 'confirmedAt'>) =>
  dayMonth.format(new Date(batch.confirmedAt));

export function foundIn(sheets: Pick<FoundSheet, 'uploadPath'>[]) {
  const tops = new Set(sheets.map((sheet) => sheet.uploadPath.split('/')[0]!));
  return tops.size === 1 && sheets[0]!.uploadPath.includes('/') ? [...tops][0]! : null;
}

export const drawableSheet = (sheet: Pick<FoundSheet, 'mimeType'>) =>
  sheet.mimeType === 'image/jpeg' || sheet.mimeType === 'image/png';

// A link lives a minute; the image loads once from it.
const linkLifeMs = 50_000;

export function useFoundSheetUrl(clientId: string, sheet: FoundSheet) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const drawable = drawableSheet(sheet);
  const link = useGetClientFileDownload(clientId, sheet.clientFileId, {
    request: apiRequest,
    query: {
      queryKey: getGetClientFileDownloadQueryKey(clientId, sheet.clientFileId),
      enabled: drawable,
      staleTime: linkLifeMs,
    },
  });
  return { drawable, url: link.data?.url, failed: link.isError };
}
