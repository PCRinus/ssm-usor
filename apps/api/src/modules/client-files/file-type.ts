import { clientFileExtensions, type ClientFileType } from '@ssm-usor/contracts';

import { zipNamesPart } from '../../lib/docx';

const startsWith = (bytes: Uint8Array, signature: number[]) =>
  bytes.length >= signature.length && signature.every((byte, index) => bytes[index] === byte);

const pdf = [0x25, 0x50, 0x44, 0x46, 0x2d];
const jpeg = [0xff, 0xd8, 0xff];
const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const compoundFile = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

// A password-protected .docx or .xlsx is a compound file, like the old formats, not a zip.
const matches: Record<ClientFileType, (bytes: Uint8Array) => boolean> = {
  'application/pdf': (bytes) => startsWith(bytes, pdf),
  'image/jpeg': (bytes) => startsWith(bytes, jpeg),
  'image/png': (bytes) => startsWith(bytes, png),
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': (bytes) =>
    zipNamesPart(bytes, 'word/document.xml') || startsWith(bytes, compoundFile),
  'application/msword': (bytes) => startsWith(bytes, compoundFile),
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': (bytes) =>
    zipNamesPart(bytes, 'xl/workbook.xml') || startsWith(bytes, compoundFile),
  'application/vnd.ms-excel': (bytes) => startsWith(bytes, compoundFile),
};

export function splitFileName(fileName: string) {
  const dot = fileName.lastIndexOf('.');
  if (dot <= 0) return { stem: fileName, extension: '' };
  return { stem: fileName.slice(0, dot), extension: fileName.slice(dot + 1).toLowerCase() };
}

export function typeOfExtension(extension: string): ClientFileType | null {
  return Object.hasOwn(clientFileExtensions, extension)
    ? clientFileExtensions[extension as keyof typeof clientFileExtensions]
    : null;
}

export const contentMatches = (type: ClientFileType, bytes: Uint8Array) => matches[type](bytes);
