import { roCount } from '@/features/employees/employee-format';
import { formatRoDate } from '@/lib/dates';

import { filesLabel, pagesLabel, photosLabel } from '../import-format';
import type { SheetPage } from './employee-review-model';

export const pageKindLabels: Record<NonNullable<SheetPage['kind']>, string> = {
  ssm_sheet_front: 'Fișa SSM, față',
  ssm_periodic: 'Fișa SSM, periodice',
  psi_sheet_front: 'Fișa PSI, față',
  psi_periodic: 'Fișa PSI, periodice',
  commute_declaration: 'Declarația de traseu',
  other: 'Altă pagină',
};

export const pageKindLabel = (page: Pick<SheetPage, 'kind'>) =>
  page.kind ? pageKindLabels[page.kind] : 'Pagină necitită';

export const pageFileName = (page: Pick<SheetPage, 'label'>) =>
  page.label
    .replace(/ \(pagina \d+\)$/, '')
    .split('/')
    .at(-1) ?? page.label;

export const peopleLabel = (count: number) =>
  count === 1 ? 'o persoană' : roCount(count, 'persoană', 'persoane');

export const trainingsLabel = (count: number) =>
  count === 1 ? 'o instruire' : roCount(count, 'instruire', 'instruiri');

export const onlyPhotos = (files: { mimeType: string }[]) =>
  files.every((file) => file.mimeType.startsWith('image/'));

export const sheetFilesLabel = (files: { mimeType: string }[]) =>
  onlyPhotos(files) ? photosLabel(files.length) : filesLabel(files.length);

export function pagesPhotosLabel(pages: SheetPage[]) {
  const photos = new Set(pages.map((page) => page.fileId)).size;
  return pages.every((page) => page.page === null) ? photosLabel(photos) : pagesLabel(pages.length);
}

export function durationLabel(minutes: number | null) {
  if (minutes === null) return null;
  if (minutes % 60 === 0) return minutes === 60 ? '1 oră' : `${minutes / 60} ore`;
  return `${minutes} min`;
}

export const dateLabel = (iso: string | null) => (iso ? formatRoDate(iso) : null);

export const joinNames = (names: string[]) =>
  names.length > 1 ? `${names.slice(0, -1).join(', ')} și ${names.at(-1)}` : (names[0] ?? '');
