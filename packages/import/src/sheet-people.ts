import { decodeCnp, isValidCnp } from '@ssm-usor/contracts';

import type { PagePlacement } from './employee-proposal';
import { editDistance, foldName, foldText } from './match';
import { sheetDate, type SheetPage } from './sheet-page';

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
const letterAdded = (a: string, b: string) =>
  a.length !== b.length && (a.startsWith(b) || b.startsWith(a));

// Liviu and Livia: a man's and a woman's form of one name are one edit apart, never a misread.
const lastTurnedToA = (a: string, b: string) =>
  a.length === b.length &&
  a.slice(0, -1) === b.slice(0, -1) &&
  (a.endsWith('a') || b.endsWith('a'));

// `bornSame` when the pages give the same birth date, which tells a misread last letter from
// another person's name.
const closeWord = (a: string, b: string, bornSame = false) =>
  a === b ||
  (a.length >= 4 &&
    b.length >= 4 &&
    editDistance(a, b) <= 1 &&
    !letterAdded(a, b) &&
    (bornSame || !lastTurnedToA(a, b)));

function sharedWords(x: readonly string[], y: readonly string[], bornSame = false) {
  const free = [...y];
  let shared = 0;
  for (const word of x) {
    const at = free.findIndex((other) => closeWord(word, other, bornSame));
    if (at === -1) continue;
    free.splice(at, 1);
    shared++;
  }
  return shared;
}

const words = (name: string) => name.split(' ').filter(Boolean);

// One misread letter or a given name cut short on one page must not split a person, as exact
// names did in the evaluation: the surname within one edit and about two thirds of the parts
// shared. Sheets write the surname first or last, so either name's first word is looked for
// anywhere in the other.
export function nearName(a: string, b: string) {
  const x = words(a);
  const y = words(b);
  if (x.length === 0 || y.length === 0) return false;
  const found = (word: string, others: readonly string[]) =>
    others.some((other) => closeWord(word, other));
  if (!found(x[0]!, y) || !found(y[0]!, x)) return false;
  return sharedWords(x, y) / Math.min(x.length, y.length) >= 0.66;
}

// A shared birth date vouches for the person, so a surname misread in more than one letter, or
// in its last letter, must not split them.
export function nearNameBornSame(a: string, b: string) {
  const x = words(a);
  const y = words(b);
  if (x.length === 0 || y.length === 0) return false;
  return sharedWords(x, y, true) / Math.min(x.length, y.length) >= 0.66;
}

// A page with nothing to say about anyone is never someone's continuation.
const continues = (page: SheetPage) => page.pageKind !== 'other' || page.trainings.length > 0;

const identifies = (page: SheetPage) =>
  pageName(page) !== '' || pageCnp(page) !== null || pageEmployeeNumber(page) !== null;

function pageBirthDates(page: SheetPage, today: string) {
  const cnp = pageCnp(page);
  const encoded = cnp === null ? null : decodeCnp(cnp).birthDate;
  // A CNP whose control digit holds is read right; a handwritten date beside it may not be.
  if (encoded !== null) return [encoded];
  const written = sheetDate(page.fields.birthDate, today);
  return written !== null && !written.monthOnly ? [written.date] : [];
}

const dayAndMonthSwapped = (date: string) =>
  `${date.slice(0, 4)}-${date.slice(8)}-${date.slice(5, 7)}`;

// One misread digit, or a day and month read in each other's place, must not split a person.
const sameBirth = (a: string, b: string) =>
  [...a].filter((digit, index) => digit !== b[index]).length <= 1 || dayAndMonthSwapped(a) === b;

const postWords = (title: string | null) =>
  foldText(title ?? '')
    .split(' ')
    .filter((word) => word.length >= 3);

// A periodic page's narrow column cuts the post short: "res." for "resurse".
const postFits = (words: readonly string[], post: readonly string[]) =>
  words.filter((word) => post.some((known) => known.startsWith(word))).length;

interface Group {
  pages: string[];
  names: string[];
  cnps: string[];
  numbers: string[];
  births: string[];
  posts: string[][];
}

// Pages with a name, a CNP or an employee number are grouped first, whatever their place in the
// upload: an upload's order is not the order the sheets were photographed in.
export function placePages(pages: readonly PageToPlace[], today: string): PlacedPages {
  const groups: Group[] = [];
  const placements = new Map<string, Placement>();
  const place = (id: string, at: number, placement: PagePlacement) => {
    groups[at]!.pages.push(id);
    placements.set(id, { group: at, placement });
  };
  const remember = (at: number, page: SheetPage) => {
    const group = groups[at]!;
    const name = pageName(page);
    const cnp = pageCnp(page);
    const number = pageEmployeeNumber(page);
    const post = postWords(page.fields.jobTitle);
    if (name && !group.names.includes(name)) group.names.push(name);
    if (cnp && !group.cnps.includes(cnp)) group.cnps.push(cnp);
    if (number && !group.numbers.includes(number)) group.numbers.push(number);
    for (const birth of pageBirthDates(page, today)) {
      if (!group.births.includes(birth)) group.births.push(birth);
    }
    if (post.length > 0) group.posts.push(post);
  };
  for (const { id, reading } of pages) {
    if (reading === null) {
      placements.set(id, { group: null, placement: 'unplaced' });
      continue;
    }
    if (!identifies(reading)) continue;
    const name = pageName(reading);
    const cnp = pageCnp(reading);
    const number = pageEmployeeNumber(reading);
    const births = pageBirthDates(reading, today);
    // Two people may share a name, never a CNP, and one person has one birth date.
    const bornSame = (group: Group) =>
      births.some((birth) => group.births.some((known) => sameBirth(birth, known)));
    const open = (group: Group) =>
      (cnp === null || group.cnps.length === 0 || group.cnps.includes(cnp)) &&
      (births.length === 0 || group.births.length === 0 || bornSame(group));
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
          'near_name',
          (group: Group) =>
            name !== '' &&
            open(group) &&
            bornSame(group) &&
            group.names.some((known) => nearNameBornSame(known, name)),
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
      place(id, found.at, found.placement);
      remember(found.at, reading);
      continue;
    }
    groups.push({ pages: [], names: [], cnps: [], numbers: [], births: [], posts: [] });
    place(id, groups.length - 1, 'new_person');
    remember(groups.length - 1, reading);
  }

  const byPost = (page: SheetPage) => {
    const words = postWords(page.fields.jobTitle);
    const scores = groups.map((group) =>
      Math.max(0, ...group.posts.map((post) => postFits(words, post)))
    );
    const best = Math.max(0, ...scores);
    return best > 0 && scores.filter((score) => score === best).length === 1
      ? scores.indexOf(best)
      : null;
  };
  let previous: number | null = null;
  for (const { id, reading } of pages) {
    const placed = placements.get(id);
    if (placed) {
      if (placed.group !== null) previous = placed.group;
      continue;
    }
    const post = reading !== null && continues(reading) ? byPost(reading) : null;
    if (post !== null) {
      place(id, post, 'placed_by_job_title');
      previous = post;
    } else if (reading !== null && continues(reading) && previous !== null) {
      place(id, previous, 'placed_by_order');
    } else {
      placements.set(id, { group: null, placement: 'unplaced' });
    }
  }

  const order = new Map(pages.map(({ id }, index) => [id, index]));
  return {
    groups: groups.map((group) => [...group.pages].sort((a, b) => order.get(a)! - order.get(b)!)),
    placements: new Map(pages.map(({ id }) => [id, placements.get(id)!])),
  };
}
