import {
  type BloodGroup,
  decodeCnp,
  isValidCnp,
  periodicTrainingMinutesOptions,
  type RhFactor,
} from '@ssm-usor/contracts';

import type { ProposedSheetRow, RowFlagCode } from './employee-proposal';

const groupsByNumeral: Record<string, BloodGroup> = {
  I: '0(I)',
  II: 'A(II)',
  III: 'B(III)',
  IV: 'AB(IV)',
};

const groupsByLetter: Record<string, BloodGroup> = {
  '0': '0(I)',
  O: '0(I)',
  A: 'A(II)',
  B: 'B(III)',
  AB: 'AB(IV)',
};

export interface BloodType {
  group: BloodGroup | null;
  rh: RhFactor | null;
}

function rhOf(text: string): RhFactor | null {
  if (/POZITIV|\bRH\s*\(?\s*\+|\bD\s*\+/.test(text)) return '+';
  if (/NEGATIV|\bRH\s*\(?\s*[-–]|\bD\s*[-–]/.test(text)) return '-';
  const trailing = /([+\-–])\s*\)?\s*$/.exec(text)?.[1];
  return trailing === undefined ? null : trailing === '+' ? '+' : '-';
}

/**
 * The group and Rh as the employee's columns hold them, from a sheet's "A II Rh+", "0(I) Rh
 * pozitiv" or "AB IV -". A letter and a numeral that disagree give no group.
 */
export function parseBloodType(...written: (string | null)[]): BloodType {
  const text = written
    .filter((part) => part !== null)
    .join(' ')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toUpperCase()
    .replace(/GRUPA|GRUP|SANGUINA|SANGVINA|SANGE/g, ' ');
  const rh = rhOf(text);
  const withoutRh = text.replace(/\bRH\b.*$|POZITIV|NEGATIV/g, ' ');
  const match = /(?:^|[^A-Z0-9])(AB|A|B|0|O)?\s*\(?\s*(IV|III|II|I)?\s*\)?(?=[^A-Z]|$)/g;
  let group: BloodGroup | null = null;
  for (const [, letter, numeral] of withoutRh.matchAll(match)) {
    if (!letter && !numeral) continue;
    const byLetter = letter ? groupsByLetter[letter] : undefined;
    const byNumeral = numeral ? groupsByNumeral[numeral] : undefined;
    if (byLetter && byNumeral && byLetter !== byNumeral) return { group: null, rh };
    group = byLetter ?? byNumeral ?? null;
    break;
  }
  return { group, rh };
}

export type CnpCheck =
  { status: 'valid' } | { status: 'invalid' | 'birth_date_mismatch'; correction: string | null };

// The positions of YY MM DD, which the birth date gives.
const datePositions = [1, 2, 3, 4, 5, 6];

function birthDigits(birthDate: string) {
  return `${birthDate.slice(2, 4)}${birthDate.slice(5, 7)}${birthDate.slice(8, 10)}`;
}

const agrees = (cnp: string, birthDate: string) =>
  isValidCnp(cnp) && decodeCnp(cnp).birthDate === birthDate;

// One unreadable digit ("?") or one digit of the date misread: offered only when exactly one
// code is valid and agrees with the birth date written on the sheet.
function correctionOf(written: string, birthDate: string | null): string | null {
  if (birthDate === null) return null;
  const unknown = [...written].flatMap((character, index) => (/\d/.test(character) ? [] : [index]));
  if (written.length === 13 && unknown.length === 1) {
    const at = unknown[0]!;
    const fits = '0123456789'
      .split('')
      .map((digit) => `${written.slice(0, at)}${digit}${written.slice(at + 1)}`)
      .filter((candidate) => agrees(candidate, birthDate));
    return fits.length === 1 ? fits[0]! : null;
  }
  if (!/^\d{13}$/.test(written)) return null;
  const expected = birthDigits(birthDate);
  const differing = datePositions.filter(
    (position) => written[position] !== expected[position - 1]
  );
  if (differing.length !== 1) return null;
  const at = differing[0]!;
  const candidate = `${written.slice(0, at)}${expected[at - 1]}${written.slice(at + 1)}`;
  return agrees(candidate, birthDate) ? candidate : null;
}

export function checkCnp(written: string, birthDate: string | null): CnpCheck {
  const compact = written.replace(/[\s.-]/g, '');
  if (/^\d{13}$/.test(compact) && isValidCnp(compact)) {
    const encoded = decodeCnp(compact).birthDate;
    if (birthDate === null || encoded === null || encoded === birthDate) return { status: 'valid' };
    return { status: 'birth_date_mismatch', correction: correctionOf(compact, birthDate) };
  }
  return { status: 'invalid', correction: correctionOf(compact, birthDate) };
}

export interface RowCheckContext {
  hiredAt: string | null;
  // The Romanian day.
  today: string;
}

const hiringPhases = new Set(['introductory_general', 'workplace']);

// H.G. 1425/2006 art. 80¹ gives every occupational safety phase at least an hour. No act sets one
// for fire safety, where a quarter of an hour still catches "8 ore" read as eight minutes.
const shortestMinutes: Record<ProposedSheetRow['domain'], number> = { ssm: 60, psi: 15 };

function unusualDuration(
  row: Pick<ProposedSheetRow, 'domain' | 'phase' | 'durationMinutes' | 'testOnly'>
) {
  if (row.testOnly || row.durationMinutes === null) return false;
  if (row.phase === 'periodic') {
    return !(periodicTrainingMinutesOptions as readonly number[]).includes(row.durationMinutes);
  }
  return row.durationMinutes < shortestMinutes[row.domain];
}

export function rowFlags(
  row: Pick<
    ProposedSheetRow,
    'domain' | 'phase' | 'heldOn' | 'durationMinutes' | 'testOnly' | 'signatures'
  >,
  context: RowCheckContext
): RowFlagCode[] {
  const flags: RowFlagCode[] = [];
  if (row.signatures.trainee === 'absent') flags.push('unsigned');
  if (row.signatures.trainee === 'unclear') flags.push('signature_unclear');
  if (unusualDuration(row)) flags.push('unusual_duration');
  if (row.heldOn !== null) {
    // The hiring trainings come before the admission to work, which a sheet may give as the
    // hire date.
    if (context.hiredAt !== null && !hiringPhases.has(row.phase) && row.heldOn < context.hiredAt) {
      flags.push('before_hire');
    }
    if (row.heldOn > context.today) flags.push('after_today');
  }
  return flags;
}
