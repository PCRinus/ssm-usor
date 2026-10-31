import { isValidCnp } from '@ssm-usor/contracts';

import type { PagePlacement } from './employee-proposal';
import { editDistance, foldName } from './match';
import type { SheetPage } from './sheet-page';

export interface PageToPlace {
  id: string;
  // Null for a page that could not be read.
  reading: SheetPage | null;
}

export interface Placement {
  // An index into `groups`, or null for an unplaced page.
  group: number | null;
  placement: PagePlacement;
}

export interface PlacedPages {
  // Each group is a person, with their pages' ids in the upload's order.
  groups: string[][];
  placements: Map<string, Placement>;
}

export const pageName = (page: SheetPage) =>
  foldName(`${page.person.lastName ?? ''} ${page.person.firstName ?? ''}`);

export function compactCnp(written: string) {
  const digits = written.replace(/[\s.-]/g, '');
  return /^\d{13}$/.test(digits) ? digits : null;
}

// A code whose control digit fails is one digit misread: grouping by it would split the person.
export function pageCnp(page: SheetPage) {
  const digits = compactCnp(page.person.cnp ?? '');
  return digits !== null && isValidCnp(digits) ? digits : null;
}

const pageEmployeeNumber = (page: SheetPage) => (page.person.employeeNumber ?? '').trim() || null;

// Daniel and Daniela, Ioan and Ioana: a letter added at the end is another person, not a misread.
const endsApart = (a: string, b: string) =>
  a.length !== b.length && (a.startsWith(b) || b.startsWith(a));

const closeWord = (a: string, b: string) =>
  a === b || (a.length >= 4 && b.length >= 4 && editDistance(a, b) <= 1 && !endsApart(a, b));

function sharedWords(x: readonly string[], y: readonly string[]) {
  const free = [...y];
  let shared = 0;
  for (const word of x) {
    const at = free.findIndex((other) => closeWord(word, other));
    if (at === -1) continue;
    free.splice(at, 1);
    shared++;
  }
  return shared;
}

// One misread letter or a given name cut short on one page must not split a person, as exact
// names did in the evaluation: the surname within one edit and about two thirds of the parts
// shared. Sheets write the surname first or last, so either name's first word is looked for
// anywhere in the other.
export function nearName(a: string, b: string) {
  const x = a.split(' ').filter(Boolean);
  const y = b.split(' ').filter(Boolean);
  if (x.length === 0 || y.length === 0) return false;
  const found = (word: string, words: readonly string[]) =>
    words.some((other) => closeWord(word, other));
  if (!found(x[0]!, y) || !found(y[0]!, x)) return false;
  return sharedWords(x, y) / Math.min(x.length, y.length) >= 0.66;
}

// A page with nothing to say about anyone is never someone's continuation.
const continues = (page: SheetPage) => page.pageKind !== 'other' || page.trainings.length > 0;

interface Group {
  pages: string[];
  names: string[];
  cnps: string[];
  numbers: string[];
}

export function placePages(pages: readonly PageToPlace[]): PlacedPages {
  const groups: Group[] = [];
  const placements = new Map<string, Placement>();
  let previous: number | null = null;
  const place = (id: string, at: number, placement: PagePlacement, page: SheetPage) => {
    const group = groups[at]!;
    group.pages.push(id);
    const name = pageName(page);
    const cnp = pageCnp(page);
    const number = pageEmployeeNumber(page);
    if (name && !group.names.includes(name)) group.names.push(name);
    if (cnp && !group.cnps.includes(cnp)) group.cnps.push(cnp);
    if (number && !group.numbers.includes(number)) group.numbers.push(number);
    placements.set(id, { group: at, placement });
    previous = at;
  };
  for (const { id, reading } of pages) {
    if (reading === null) {
      placements.set(id, { group: null, placement: 'unplaced' });
      continue;
    }
    const name = pageName(reading);
    const cnp = pageCnp(reading);
    const number = pageEmployeeNumber(reading);
    // Two people may share a name, never a CNP.
    const open = (group: Group) =>
      cnp === null || group.cnps.length === 0 || group.cnps.includes(cnp);
    const found = (
      [
        ['cnp', (group: Group) => cnp !== null && group.cnps.includes(cnp)],
        ['name', (group: Group) => name !== '' && open(group) && group.names.includes(name)],
        [
          'near_name',
          (group: Group) =>
            name !== '' && open(group) && group.names.some((known) => nearName(known, name)),
        ],
        [
          'employee_number',
          (group: Group) =>
            name === '' && cnp === null && number !== null && group.numbers.includes(number),
        ],
      ] as const
    )
      .map(([placement, test]) => ({ placement, at: groups.findIndex(test) }))
      .find(({ at }) => at !== -1);
    if (found) {
      place(id, found.at, found.placement, reading);
      continue;
    }
    if (name === '' && cnp === null && number === null) {
      if (previous === null || !continues(reading)) {
        placements.set(id, { group: null, placement: 'unplaced' });
      } else {
        place(id, previous, 'placed_by_order', reading);
      }
      continue;
    }
    groups.push({ pages: [], names: [], cnps: [], numbers: [] });
    place(id, groups.length - 1, 'new_person', reading);
  }
  return { groups: groups.map((group) => group.pages), placements };
}
