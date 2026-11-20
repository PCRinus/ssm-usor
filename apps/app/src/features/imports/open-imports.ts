import { capitalized, countOf, type ImportKind } from '@ssm-usor/contracts';

import type { ImportListResponseItemsItem } from '@/api/generated/api';
import { shortDayMonthFormat, timeFormat } from '@/lib/dates';

import {
  filesLabel,
  isRunning,
  isUploadStalled,
  isUploadUnderway,
  photosLabel,
} from './import-format';
import { type ImportLink, linkOf } from './import-ready-notices';
import { isOpenPart } from './library/library-model';
import { earliestExpiry } from './library/next-steps-model';

type ImportItem = ImportListResponseItemsItem;

export type ImportBand = 'review' | 'reading' | 'stopped';

export const importBands = ['review', 'reading', 'stopped'] as const;

export type OpenImport = {
  id: string;
  kind: ImportKind;
  band: ImportBand;
  tile: 'client' | 'parts' | 'employees';
  name: string;
  detail: string;
  state: string;
  stateNote: string | null;
  // Percent, for a running import whose files can be counted.
  progress: number | null;
  // Null for a row read on its own while it runs: the whole row opens the import.
  action: string | null;
  link: ImportLink;
  started: string;
  startedBy: string | null;
};

export type OpenImports = Record<ImportBand, OpenImport[]>;

type Part = ImportItem['libraryParts'][number];

const liveParts = (item: ImportItem, now: number) =>
  item.libraryParts.filter((part) => isOpenPart(part, now));

// A part read with nothing new still waits for the member to close it.
const toReview = (part: Part) => part.status === 'to_review' || part.status === 'nothing_new';

export function bandOf(item: ImportItem, now = Date.now()): ImportBand | null {
  if (item.status === 'ready') return 'review';
  if (item.status === 'failed') return 'stopped';
  if (item.status === 'uploading') return isUploadStalled(item, now) ? 'stopped' : 'reading';
  if (isRunning(item.status)) return 'reading';
  if (item.status !== 'confirmed' || item.kind !== 'client') return null;
  const parts = liveParts(item, now);
  if (parts.some(toReview)) return 'review';
  if (parts.some((part) => part.status === 'reading')) return 'reading';
  return parts.length > 0 ? 'stopped' : null;
}

export type WaitingCounts = Record<ImportKind, number> & { total: number };

export function waitingCounts(items: readonly ImportItem[], now = Date.now()): WaitingCounts {
  const counts = { client: 0, employees: 0 };
  for (const item of items) if (bandOf(item, now) === 'review') counts[item.kind] += 1;
  return { ...counts, total: counts.client + counts.employees };
}

export const statusesOf = (items: readonly ImportItem[]): ReadonlyMap<string, string> =>
  new Map(items.map((item) => [item.id, item.status]));

// An import leaves the open list when it is confirmed or abandoned, and a confirmed one with open
// library parts stays on it as confirmed.
export function closedSince(previous: ReadonlyMap<string, string>, items: readonly ImportItem[]) {
  const now = statusesOf(items);
  return [...previous].some(
    ([id, status]) => !now.has(id) || (status !== 'confirmed' && now.get(id) === 'confirmed')
  );
}

export const isAnyMoving = (items: readonly ImportItem[], now = Date.now()) =>
  items.some(
    (item) =>
      isRunning(item.status) ||
      isUploadUnderway(item, now) ||
      (item.status === 'confirmed' &&
        liveParts(item, now).some((part) => part.status === 'reading'))
  );

const nameOf = (item: ImportItem) =>
  item.client?.legalName ??
  item.companyName ??
  (item.kind === 'employees' ? 'Fișele unui client' : 'Client nou din documente');

function partsNames(parts: readonly Part[], { lower }: { lower: boolean }) {
  const instructions = parts.some((part) => part.part !== 'risk_evaluations');
  const risks = parts.some((part) => part.part === 'risk_evaluations');
  const names = [
    ...(instructions ? [lower ? 'instrucțiunile' : 'instrucțiuni'] : []),
    ...(risks ? [lower ? 'evaluările de risc' : 'evaluări de risc'] : []),
  ];
  return names.join(' și ');
}

const filesOf = (count: number) => (count === 1 ? '1 fișier' : filesLabel(count));

function detailOf(item: ImportItem, now: number) {
  if (item.kind === 'employees') {
    return ['Fișe de instruire', ...(item.fileCount > 0 ? [photosLabel(item.fileCount)] : [])].join(
      ' · '
    );
  }
  if (item.status === 'confirmed') {
    const parts = partsNames(liveParts(item, now), { lower: false });
    return [item.intoExistingClient ? 'Client completat' : 'Client creat', capitalized(parts)].join(
      ' · '
    );
  }
  const named = Boolean(item.client ?? item.companyName);
  return [
    ...(named ? [item.intoExistingClient ? 'Client existent' : 'Client nou'] : []),
    'Dosarul SSM și SU',
    ...(item.fileCount > 0 ? [filesOf(item.fileCount)] : []),
  ].join(' · ');
}

const until = (iso: string | null) =>
  iso ? `până pe ${shortDayMonthFormat.format(new Date(iso))}` : null;

const sentence = (parts: (string | null)[]) => {
  const text = parts.filter(Boolean).join(' · ');
  return text ? capitalized(text) : null;
};

const checkedLabel = (count: number) => (count === 1 ? '1 verificată' : `${count} verificate`);
const setAsideLabel = (count: number) =>
  count === 1 ? '1 lăsată deoparte' : `${count} lăsate deoparte`;

function reviewState(item: ImportItem, now: number) {
  if (item.status === 'confirmed') {
    const open = liveParts(item, now).filter(toReview);
    return {
      state:
        open.length === 1
          ? 'O parte de verificat'
          : `${countOf(open.length, 'parte', 'părți')} de verificat`,
      stateNote: sentence([until(earliestExpiry(open))]),
      action: 'Verifică părțile',
    };
  }
  if (item.kind === 'employees') {
    const people = item.people;
    const done = [
      people && people.checked > 0 ? checkedLabel(people.checked) : null,
      people && people.setAside > 0 ? setAsideLabel(people.setAside) : null,
    ].filter(Boolean);
    return {
      state: !people
        ? 'Persoane de verificat'
        : people.toCheck === 0
          ? 'Persoanele sunt verificate'
          : `${countOf(people.toCheck, 'persoană', 'persoane')} de verificat`,
      stateNote: sentence([done.join(', ') || null, until(item.expiresAt)]),
      action: 'Verifică persoanele',
    };
  }
  return {
    state: 'Propunere de verificat',
    stateNote: sentence([until(item.expiresAt)]),
    action: 'Verifică propunerea',
  };
}

const clientSteps = ['preparing', 'sorting', 'reading', 'checking'];

const stepTitles: Record<ImportKind, Record<string, string>> = {
  client: {
    preparing: 'Se pregătesc fișierele',
    sorting: 'Se sortează documentele',
    reading: 'Se citește documentația',
    checking: 'Se verifică datele',
  },
  employees: {
    preparing: 'Se pregătesc fotografiile',
    sorting: 'Se citesc fotografiile',
    reading: 'Se citesc fotografiile',
    checking: 'Se grupează pe persoane',
  },
};

function runningStep(item: ImportItem): { step: string; progress: number | null } {
  const progress = item.progress;
  const photos = item.kind === 'employees';
  if (item.status === 'preparing') {
    if (!progress || progress.files === 0) return { step: 'pregătim fișierele', progress: null };
    return {
      step: `${progress.prepared} din ${countOf(progress.files, 'fișier', 'fișiere')} pregătite`,
      progress: (progress.prepared / progress.files) * 100,
    };
  }
  if (item.status === 'checking') {
    return { step: photos ? 'le grupăm pe persoane' : 'verificăm datele', progress: null };
  }
  if (item.status === 'sorting' && !photos) return { step: 'le sortăm', progress: null };
  if (progress && progress.scans > 0) {
    const total = photos
      ? countOf(progress.scans, 'fotografie', 'fotografii')
      : countOf(progress.scans, 'scanare', 'scanări');
    return {
      step: `${progress.scansRead} din ${total} citite`,
      progress: (progress.scansRead / progress.scans) * 100,
    };
  }
  return { step: photos ? 'citim fotografiile' : 'citim documentația', progress: null };
}

function readingState(item: ImportItem, now: number) {
  if (item.status === 'confirmed') {
    return {
      state: `Se citesc ${partsNames(
        liveParts(item, now).filter((part) => part.status === 'reading'),
        { lower: true }
      )}`,
      stateNote: null,
      progress: null,
    };
  }
  const photos = item.kind === 'employees';
  if (item.status === 'uploading') {
    return {
      state: photos ? 'Se încarcă fotografiile' : 'Se încarcă fișierele',
      stateNote: null,
      progress: null,
    };
  }
  const { step, progress } = runningStep(item);
  const counted = progress !== null;
  const stepNumber = clientSteps.indexOf(item.status) + 1;
  return {
    state: stepTitles[item.kind][item.status] ?? capitalized(step),
    stateNote: sentence([
      photos ? null : `pasul ${stepNumber} din ${clientSteps.length}`,
      counted ? step : null,
    ]),
    progress,
  };
}

function startedWhen(iso: string, now: number) {
  const date = new Date(iso);
  return date.toDateString() === new Date(now).toDateString()
    ? `Azi, ${timeFormat.format(date)}`
    : shortDayMonthFormat.format(date);
}

const tileOf = (item: ImportItem): OpenImport['tile'] =>
  item.kind === 'employees' ? 'employees' : item.status === 'confirmed' ? 'parts' : 'client';

function rowOf(item: ImportItem, band: ImportBand, now: number): OpenImport {
  const base = {
    id: item.id,
    kind: item.kind,
    band,
    tile: tileOf(item),
    name: nameOf(item),
    detail: detailOf(item, now),
    link: linkOf(item),
    started: startedWhen(item.createdAt, now),
    startedBy: item.createdBy?.fullName ?? null,
  };
  if (band === 'review') return { ...base, ...reviewState(item, now), progress: null };
  if (band === 'stopped') {
    return {
      ...base,
      state: 'S-a oprit',
      stateNote:
        item.status === 'confirmed'
          ? `Nu s-au putut citi ${partsNames(liveParts(item, now), { lower: true })}.`
          : item.status === 'uploading'
            ? 'Încărcarea nu s-a terminat, așa că citirea n-a pornit.'
            : (item.failureReason ?? 'Importul s-a oprit din cauza unei erori.'),
      progress: null,
      action: 'Vezi importul',
    };
  }
  return { ...base, ...readingState(item, now), action: null };
}

export function openImportsOf(
  items: readonly ImportItem[],
  kind: ImportKind,
  now = Date.now()
): OpenImports {
  const groups: OpenImports = { review: [], reading: [], stopped: [] };
  for (const item of items) {
    if (item.kind !== kind) continue;
    const band = bandOf(item, now);
    if (band) groups[band].push(rowOf(item, band, now));
  }
  return groups;
}

export const openCount = (groups: OpenImports) =>
  groups.review.length + groups.reading.length + groups.stopped.length;
