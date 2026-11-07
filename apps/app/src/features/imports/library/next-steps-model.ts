import type { ImportLibraryPart } from '@ssm-usor/contracts';

import { roCount } from '@/features/employees/employee-format';

import { isExpired, isOpenPart, joinNames, libraryDay, type PartStatus } from './library-model';

type PartTiming = { part: ImportLibraryPart; status: PartStatus; expiresAt: string | null };

const startOfDay = (time: number) => {
  const day = new Date(time);
  day.setHours(0, 0, 0, 0);
  return day.getTime();
};

// By calendar days, as the deadline names a day: on the day itself nothing is left.
export function daysLeft(expiresAt: string, now = Date.now()) {
  return Math.round((startOfDay(Date.parse(expiresAt)) - startOfDay(now)) / 86_400_000);
}

export function deadlineLine(expiresAt: string, now = Date.now()) {
  const left = daysLeft(expiresAt, now);
  const rest =
    left <= 0 ? 'expiră azi' : left === 1 ? 'mai ai o zi' : `mai ai ${roCount(left, 'zi', 'zile')}`;
  return `Până pe ${libraryDay(expiresAt)} · ${rest}`;
}

export function earliestExpiry(parts: readonly { expiresAt: string | null }[]) {
  const times = parts.flatMap((part) => (part.expiresAt ? [Date.parse(part.expiresAt)] : []));
  return times.length > 0 ? new Date(Math.min(...times)).toISOString() : null;
}

const isRisks = (part: { part: ImportLibraryPart }) => part.part === 'risk_evaluations';

export function takenSentence(confirmed: readonly { part: ImportLibraryPart }[]) {
  const names = [
    'Datele clientului',
    ...(confirmed.some((part) => !isRisks(part)) ? ['instrucțiunile'] : []),
    ...(confirmed.some(isRisks) ? ['evaluările de risc'] : []),
  ];
  return `${joinNames(names)} sunt preluate. Poți genera documentația clientului.`;
}

// Only parts with something the library does not have yet are "pe care nu le ai".
export function foundSentence(
  open: readonly (PartTiming & { counts: { new: number; similar: number } | null })[]
) {
  const unknown = open.filter(
    (part) =>
      part.status === 'to_review' && (part.counts?.new ?? 0) + (part.counts?.similar ?? 0) > 0
  );
  const names = [
    ...(unknown.some((part) => !isRisks(part)) ? ['instrucțiuni'] : []),
    ...(unknown.some(isRisks) ? ['evaluări de risc'] : []),
  ];
  return names.length > 0 ? `Am găsit în pachet ${names.join(' și ')} pe care nu le ai.` : null;
}

const shortDay = new Intl.DateTimeFormat('ro-RO', { day: 'numeric', month: 'short' });

export type ImportOutcome =
  | { kind: 'open'; label: string }
  | { kind: 'done'; label: string }
  | { kind: 'expired'; label: string };

export function importOutcome(parts: readonly PartTiming[], now = Date.now()): ImportOutcome {
  const open = parts.filter((part) => isOpenPart(part, now));
  if (open.length > 0) {
    const until = earliestExpiry(open);
    return {
      kind: 'open',
      label: `${open.length} de verificat${until ? `, până pe ${shortDay.format(new Date(until))}` : ''}`,
    };
  }
  const expired = parts.filter((part) => isExpired(part, now));
  if (expired.length === 0) return { kind: 'done', label: 'Încheiat' };
  const instructions = expired.some((part) => !isRisks(part));
  const risks = expired.some(isRisks);
  return {
    kind: 'expired',
    label:
      instructions && risks
        ? 'Instrucțiunile și evaluările au expirat'
        : instructions
          ? 'Instrucțiunile au expirat'
          : 'Evaluările au expirat',
  };
}
