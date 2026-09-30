import {
  clientFileErrorReasons,
  clientFileExtensions,
  type ClientFileType,
  maxClientFileBytes,
} from '@ssm-usor/contracts';
import { FileImage, FileSpreadsheet, FileText, FileType, type LucideIcon } from 'lucide-react';

import type { ApiErrorResponse, ClientFileListResponse } from '../api/generated/api';
import { ApiHttpError } from '../api/http';
import { dateToIso, formatRoDate } from '../lib/dates';

export type ClientFile = ClientFileListResponse['items'][number];

export const clientFileAccept = Object.keys(clientFileExtensions)
  .map((extension) => `.${extension}`)
  .join(',');

const kinds: Record<ClientFileType, { label: string; icon: LucideIcon }> = {
  'application/pdf': { label: 'PDF', icon: FileText },
  'image/jpeg': { label: 'Imagine', icon: FileImage },
  'image/png': { label: 'Imagine', icon: FileImage },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': {
    label: 'Word',
    icon: FileType,
  },
  'application/msword': { label: 'Word', icon: FileType },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': {
    label: 'Excel',
    icon: FileSpreadsheet,
  },
  'application/vnd.ms-excel': { label: 'Excel', icon: FileSpreadsheet },
};

export const fileKind = (mimeType: ClientFileType) => kinds[mimeType];

// The types `/files/download` shows in a tab; the rest download.
export const opensInTab = (mimeType: ClientFileType) =>
  mimeType === 'application/pdf' || mimeType.startsWith('image/');

const decimal = new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 1 });

// In binary units, so that the 20 MiB limit reads as the "20 MB" the messages promise.
export function formatFileSize(bytes: number) {
  const kilobytes = bytes / 1024;
  if (kilobytes < 1000) return `${Math.max(1, Math.round(kilobytes))} KB`;
  return `${decimal.format(kilobytes / 1024)} MB`;
}

export const formatUploadDate = (createdAt: string) => formatRoDate(dateToIso(new Date(createdAt)));

export function fileCountLabel(count: number) {
  if (count === 1) return 'un fișier';
  const tens = count % 100;
  return tens === 0 || tens >= 20 ? `${count} de fișiere` : `${count} fișiere`;
}

const refusals = {
  [clientFileErrorReasons.typeNotAllowed]:
    'Se pot încărca doar fișiere PDF, JPEG, PNG, Word și Excel.',
  [clientFileErrorReasons.contentMismatch]:
    'Conținutul nu corespunde tipului din numele fișierului. Salvează-l din nou din programul în care a fost creat.',
  [clientFileErrorReasons.empty]: 'Fișierul este gol.',
  [clientFileErrorReasons.tooLarge]: 'Fișierul depășește 20 MB.',
} as const;

const maxFileNameLength = 255;

export function refusalBeforeUpload(file: File) {
  const extension = /\.([^.]+)$/.exec(file.name)?.[1]?.toLowerCase();
  if (!extension || !Object.hasOwn(clientFileExtensions, extension)) {
    return refusals[clientFileErrorReasons.typeNotAllowed];
  }
  if (file.size === 0) return refusals[clientFileErrorReasons.empty];
  if (file.size > maxClientFileBytes) return refusals[clientFileErrorReasons.tooLarge];
  if (file.name.length > maxFileNameLength) {
    return 'Numele fișierului are peste 255 de caractere. Scurtează-l și încearcă din nou.';
  }
  return null;
}

export const archivedMessage =
  'Clientul este arhivat, așa că fișierele lui nu mai pot fi modificate.';

export function uploadFailureMessage(cause: unknown) {
  if (!(cause instanceof ApiHttpError)) {
    return 'Fișierul nu a putut fi încărcat. Verifică conexiunea și încearcă din nou.';
  }
  const reason = (cause.body as Partial<ApiErrorResponse> | undefined)?.reason;
  if (reason && Object.hasOwn(refusals, reason)) return refusals[reason as keyof typeof refusals];
  if (cause.status === 409) return archivedMessage;
  if (cause.status === 403) {
    return 'Doar administratorii pot încărca fișiere pentru administratori.';
  }
  if (cause.status === 401) {
    return 'Sesiunea nu mai este validă. Deconectează-te și autentifică-te din nou.';
  }
  return 'Fișierul nu a putut fi încărcat. Încearcă din nou.';
}
