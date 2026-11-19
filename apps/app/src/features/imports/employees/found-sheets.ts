import {
  type FoundSheetsResponse,
  getListClientFilesQueryKey,
  getListFoundSheetsQueryKey,
  useListClientFiles,
  useListFoundSheets,
} from '@/api/generated/api';
import { useApi } from '@/api/use-api';

export type FoundSheet = FoundSheetsResponse['items'][number]['sheets'][number];
export type FoundBatch = FoundSheetsResponse['items'][number];

export function useFoundSheets(clientId: string, enabled = true) {
  const { request, ready, key } = useApi();
  return useListFoundSheets(clientId, {
    request,
    query: {
      queryKey: key(getListFoundSheetsQueryKey(clientId)),
      enabled: enabled && ready,
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

// As starting the import charges a sheet: a PDF by its pages, one when they were not counted.
export const foundSheetPages = (sheet: Pick<FoundSheet, 'mimeType' | 'pageCount'>) =>
  sheet.mimeType === 'application/pdf' ? (sheet.pageCount ?? 1) : 1;

export const drawableSheet = (sheet: Pick<FoundSheet, 'mimeType'>) =>
  sheet.mimeType === 'image/jpeg' || sheet.mimeType === 'image/png';

const linkLifeMs = 50_000;

export function useFoundSheetUrl(clientId: string, sheet: FoundSheet) {
  const { request, key } = useApi();
  const drawable = drawableSheet(sheet);
  const link = useListClientFiles(clientId, undefined, {
    request,
    query: {
      queryKey: key(getListClientFilesQueryKey(clientId)),
      enabled: drawable,
      staleTime: linkLifeMs,
    },
  });
  return {
    drawable,
    url: link.data?.items.find((file) => file.id === sheet.clientFileId)?.link.url,
    failed: link.isError,
  };
}
