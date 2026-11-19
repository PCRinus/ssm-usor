import {
  clientFileErrorReasons,
  clientFileExtensions,
  type ClientFileType,
  maxClientFileBytes,
} from '@ssm-usor/contracts';
import {
  File as FileIcon,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileType,
  type LucideIcon,
} from 'lucide-react';

import type { ClientFileListResponse } from '@/api/generated/api';
import { apiErrorBody, ApiHttpError } from '@/api/http';
import { commonFailure } from '@/lib/api-errors';
import { dateToIso, formatRoDate } from '@/lib/dates';

export type ClientFile = ClientFileListResponse['items'][number];

export type ClientFileEmployee = NonNullable<ClientFile['employee']>;

export const clientFileAccept = Object.keys(clientFileExtensions)
  .map((extension) => `.${extension}`)
  .join(',');

export const fileKindKeys = ['pdf', 'image', 'word', 'excel'] as const;

export type FileKindKey = (typeof fileKindKeys)[number];

export const fileKindLabels: Record<FileKindKey, string> = {
  pdf: 'PDF',
  image: 'Imagine',
  word: 'Word',
  excel: 'Excel',
};

const kinds: Record<ClientFileType, { key: FileKindKey; icon: LucideIcon }> = {
  'application/pdf': { key: 'pdf', icon: FileText },
  'image/jpeg': { key: 'image', icon: FileImage },
  'image/png': { key: 'image', icon: FileImage },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': {
    key: 'word',
    icon: FileType,
  },
  'application/msword': { key: 'word', icon: FileType },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': {
    key: 'excel',
    icon: FileSpreadsheet,
  },
  'application/vnd.ms-excel': { key: 'excel', icon: FileSpreadsheet },
};

const kindOf = (mimeType: ClientFileType) => {
  const kind = Object.hasOwn(kinds, mimeType) ? kinds[mimeType] : undefined;
  return kind && { ...kind, label: fileKindLabels[kind.key] };
};

// The contract allows only the four kinds; "Altul" covers a type a newer API sends first.
export const fileKind = (mimeType: ClientFileType) =>
  kindOf(mimeType) ?? { key: null, icon: FileIcon, label: 'Altul' };

const extensionOf = (fileName: string) => /\.([^.]+)$/.exec(fileName)?.[1]?.toLowerCase();

export function chosenFileKind(fileName: string) {
  const extension = extensionOf(fileName);
  if (!extension || !Object.hasOwn(clientFileExtensions, extension)) return null;
  return kindOf(clientFileExtensions[extension as keyof typeof clientFileExtensions]) ?? null;
}

const decimal = new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 1 });

// In binary units, so that the 25 MiB limit reads as the "25 MB" the messages promise.
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
  [clientFileErrorReasons.tooLarge]: 'Fișierul depășește 25 MB.',
} as const;

const maxFileNameLength = 255;

export function refusalBeforeUpload(file: File) {
  if (!chosenFileKind(file.name)) return refusals[clientFileErrorReasons.typeNotAllowed];
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
  const common = commonFailure(cause);
  if (common) return common;
  const body = apiErrorBody(cause);
  const reason = body?.reason;
  if (reason && Object.hasOwn(refusals, reason)) return refusals[reason as keyof typeof refusals];
  if (cause.status === 409) return archivedMessage;
  if (body?.issues?.some((issue) => issue.path === 'employeeId')) {
    return 'Lucrătorul nu mai există la acest client.';
  }
  if (cause.status === 403) {
    return 'Doar adminii pot încărca fișiere pentru admini.';
  }
  return 'Fișierul nu a putut fi încărcat. Încearcă din nou.';
}
