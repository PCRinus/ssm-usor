import { foldText } from './fold-text';

interface LegalForm {
  // Two company names with forms of different ids are two companies.
  id: string;
  initials: readonly string[];
  spelledOut: readonly string[];
  // Dropped wherever they stand in any name, a person's or a workplace's too, as names were
  // always compared: `spaced` letters may stand a space apart, `joined` ones not ("S. A." are a
  // person's initials), and `dotted` ones need a point after the first ("Hala II"). The other
  // forms count only at an end of a company's name: inside one, "SCM", "Bin" or "bej" are words.
  inside?: 'spaced' | 'joined' | 'dotted';
  // "II" numbers a building ("Hala II") and "IF" stands inside names ("Casa IF Design"): as a
  // bare word they count only at the end of a company's name or of a search.
  alsoAWord?: true;
  // A generic name ("birou notarial") fits the forms it stands for. "BNP" is also a bank's
  // initials, so such a form is read only when comparing companies, never in a search.
  standsFor?: readonly string[];
  // A doctor's office names its doctor with "Dr." or not: "CMI Dr. Popescu Ion".
  medical?: true;
}

const cooperativeGrades = ['', ' de gradul 1', ' de gradul I', ' de gradul 2', ' de gradul II'];

const legalForms: readonly LegalForm[] = [
  { id: 'sc', initials: ['SC'], spelledOut: ['societate comercială'], inside: 'spaced' },
  {
    id: 'srl',
    initials: ['SRL'],
    spelledOut: ['societate cu răspundere limitată'],
    inside: 'spaced',
  },
  { id: 'srl', initials: ['SRL-D'], spelledOut: ['societate cu răspundere limitată debutant'] },
  { id: 'sa', initials: ['SA'], spelledOut: ['societate pe acțiuni'], inside: 'joined' },
  { id: 'snc', initials: ['SNC'], spelledOut: ['societate în nume colectiv'] },
  { id: 'scs', initials: ['SCS'], spelledOut: ['societate în comandită simplă'] },
  {
    id: 'sca',
    initials: ['SCA'],
    spelledOut: ['societate în comandită pe acțiuni', 'societate civilă de avocați'],
  },
  {
    id: 'pfa',
    initials: ['PFA'],
    spelledOut: ['persoană fizică autorizată'],
    inside: 'spaced',
  },
  {
    id: 'ii',
    initials: ['II'],
    spelledOut: ['întreprindere individuală'],
    inside: 'dotted',
    alsoAWord: true,
  },
  {
    id: 'if',
    initials: ['IF'],
    spelledOut: ['întreprindere familială'],
    inside: 'dotted',
    alsoAWord: true,
  },
  { id: 'pfi', initials: ['PFI'], spelledOut: ['persoană fizică independentă'] },
  { id: 'af', initials: ['AF'], spelledOut: ['asociație familială'], alsoAWord: true },
  { id: 'sag', initials: [], spelledOut: ['societate agricolă'] },
  {
    id: 'scm',
    initials: ['SCM'],
    spelledOut: [
      'societate civilă medicală',
      ...cooperativeGrades.map((grade) => `societate cooperativă meșteșugărească${grade}`),
      ...cooperativeGrades.map((grade) => `societate cooperativă${grade}`),
      'cooperativă meșteșugărească',
    ],
    medical: true,
  },
  { id: 'cmi', initials: ['CMI'], spelledOut: ['cabinet medical individual'], medical: true },
  { id: 'cmg', initials: [], spelledOut: ['cabinete medicale grupate'], medical: true },
  { id: 'cma', initials: [], spelledOut: ['cabinete medicale asociate'], medical: true },
  {
    id: 'cabinet-medical',
    initials: [],
    spelledOut: ['cabinet medical'],
    standsFor: ['cmi', 'cmg', 'cma', 'scm'],
    medical: true,
  },
  {
    id: 'bin',
    initials: ['BIN'],
    spelledOut: ['birou individual notarial', 'birou notarial individual'],
  },
  { id: 'spn', initials: ['SPN'], spelledOut: ['societate profesională notarială'] },
  {
    id: 'bnp',
    initials: ['BNP'],
    spelledOut: ['birou notarial public', 'birou notarial'],
    standsFor: ['bin', 'spn'],
  },
  {
    id: 'cab',
    initials: [],
    spelledOut: [
      'cabinet de avocat',
      'cabinet avocat',
      'cabinet individual de avocat',
      'cabinet de avocatură',
    ],
  },
  { id: 'caa', initials: [], spelledOut: ['cabinete de avocat asociate'] },
  { id: 'scpa', initials: ['SCPA'], spelledOut: ['societate civilă profesională de avocați'] },
  {
    id: 'sparl',
    initials: ['SPARL'],
    spelledOut: ['societate profesională de avocați cu răspundere limitată'],
  },
  {
    id: 'bej',
    initials: ['BEJ'],
    spelledOut: [
      'birou executor judecătoresc',
      'birou de executor judecătoresc',
      'birou executorului judecătoresc',
    ],
  },
  {
    id: 'scpej',
    initials: ['SCPEJ'],
    spelledOut: ['societate civilă profesională de executori judecătorești'],
  },
  { id: 'cii', initials: ['CII'], spelledOut: ['cabinet individual de insolvență'] },
  {
    id: 'sprl',
    initials: ['SPRL'],
    spelledOut: [
      'societate profesională cu răspundere limitată',
      'societate civilă profesională cu răspundere limitată',
    ],
  },
  {
    id: 'ipurl',
    initials: ['IPURL'],
    spelledOut: [
      'întreprindere profesională unipersonală cu răspundere limitată',
      'întreprindere unipersonală cu răspundere limitată',
    ],
  },
];

const folded = new Map(
  legalForms.map((form) => [
    form,
    {
      phrases: form.spelledOut.map((phrase) => foldText(phrase).split(' ')),
      initials: form.initials.map((initials) => foldText(initials).split(' ')),
    },
  ])
);

const lettersIn = (forms: readonly LegalForm[]) =>
  new Set(forms.flatMap((form) => folded.get(form)!.initials.map((parts) => parts.join(''))));

const insideForms = legalForms.filter((form) => form.inside);

function insidePattern(form: LegalForm) {
  const [first, ...rest] = [...folded.get(form)!.initials[0]!.join('')];
  const marked = (letter: string) => `${letter}\\.?`;
  if (form.inside === 'joined') return [first!, ...rest].map(marked).join('');
  if (form.inside === 'dotted') return `${first}\\.\\s?${rest.map(marked).join('\\s?')}`;
  return [first!, ...rest].map(marked).join('\\s?');
}

// Not inside initials that run on ("S.A.M.E.", "M.S.C."), which are a name of their own.
const insideRegex = new RegExp(
  `(?<!\\p{L}\\.)\\b(?:${[...insideForms.map(insidePattern), 'd-na', 'dl\\.?', 'd-l'].join('|')})` +
    '(?=\\s|$|[^\\p{L}.]|\\.(?:\\s|$|[^\\p{L}]))',
  'gu'
);

const marks = /\p{M}/gu;

export function withoutInsideForms(value: string) {
  const plain = value.normalize('NFD').replace(marks, '').toLowerCase();
  return foldText(plain.replace(insideRegex, ' '));
}

interface Token {
  letters: string;
  kind: 'word' | 'letter' | 'initials' | 'kept';
}

const singleLetter = /^\p{L}$/u;

function tokenize(value: string): Token[] {
  const text = value.normalize('NFD').toLowerCase().replace(marks, '');
  return [...text.matchAll(/[\p{L}\p{N}]+(?:\.[\p{L}\p{N}]+)*/gu)].flatMap(([piece]): Token[] => {
    const parts = piece.split('.');
    if (parts.length > 1 && parts.every((part) => singleLetter.test(part))) {
      return [{ letters: parts.join(''), kind: 'initials' }];
    }
    return parts.map((part) => ({
      letters: part,
      kind: singleLetter.test(part) ? 'letter' : 'word',
    }));
  });
}

const splitWords = (tokens: readonly Token[]) =>
  tokens.flatMap((token) => (token.kind === 'initials' ? [...token.letters] : [token.letters]));

const asKept = (letters: readonly string[]): Token[] =>
  letters.map((letter) => ({ letters: letter, kind: 'kept' }));

interface Found {
  length: number;
  form: LegalForm;
  // Read from a word that may be part of the name: a bare "II" or "IF", or initials at its
  // start written as a word ("SCM Impex").
  bare: boolean;
}

// The head noun takes the article: Societatea, Biroul, Cabinetul, Cabinetele, Asociația.
const articles = ['', 'a', 'l', 'ul', 'le'];
const withArticle = (word: string) => [
  ...articles.map((article) => word + article),
  ...(word.endsWith('ie') ? [`${word.slice(0, -1)}a`] : []),
];

function phraseAt(tokens: readonly Token[], at: number, phrase: readonly string[]) {
  return phrase.every((word, offset) => {
    const token = tokens[at + offset];
    if (token?.kind !== 'word' && token?.kind !== 'letter') return false;
    return offset === 0 ? withArticle(word).includes(token.letters) : token.letters === word;
  });
}

// `bareWords` reads "II" and "IF" written as one word.
function formAt(
  tokens: readonly Token[],
  at: number,
  forms: readonly LegalForm[],
  bareWords: boolean
): Found | null {
  let found: Found | null = null;
  const take = (length: number, form: LegalForm, bare = false) => {
    if (!found || length > found.length) found = { length, form, bare };
  };
  for (const form of forms) {
    const { phrases, initials } = folded.get(form)!;
    for (const words of phrases) {
      if (phraseAt(tokens, at, words)) take(words.length, form);
    }
    for (const parts of initials) {
      const token = tokens[at];
      const asOne =
        token !== undefined &&
        token.letters === parts.join('') &&
        (token.kind === 'initials' ||
          (token.kind === 'word' && (bareWords || form.alsoAWord !== true)));
      if (asOne) take(1, form, token.kind === 'word');
      const asParts =
        parts.length > 1 &&
        parts.every((part, offset) => {
          const each = tokens[at + offset];
          return each !== undefined && each.kind !== 'kept' && each.letters === part;
        });
      if (asParts) take(parts.length, form);
    }
  }
  return found;
}

function formEndingAt(
  tokens: readonly Token[],
  first: number,
  end: number,
  forms: readonly LegalForm[],
  bareWords: boolean
): Found | null {
  const before = tokens.slice(0, end);
  for (let length = end - first; length > 0; length--) {
    const found = formAt(before, end - length, forms, bareWords);
    if (found?.length === length) return found;
  }
  return null;
}

function letterRunEnd(tokens: readonly Token[], at: number, end: number) {
  let next = at;
  while (next < end && tokens[next]!.kind === 'letter') next++;
  return next;
}

function letterRunStart(tokens: readonly Token[], first: number, end: number) {
  let start = end;
  while (start > first && tokens[start - 1]!.kind === 'letter') start--;
  return start;
}

const letters = (tokens: readonly Token[]) => tokens.map((token) => token.letters).join('');

const opening = legalForms.find((form) => form.id === 'sc')!;
const companyForms = legalForms.filter((form) => form !== opening);
const companyLetters = lettersIn(companyForms);
const insideLetters = lettersIn(insideForms);
const formInitials = lettersIn(legalForms);

export const isFormInitials = (word: string) => formInitials.has(foldText(word).replace(/ /g, ''));

// "S.C." opens most old names, so initials that start with it ("S.C.A.B.") lose it, unless they
// are a form of their own ("S.C.M.", "S.C.P.E.J.").
function withoutOpening(token: Token): Token[] {
  if (
    token.kind !== 'initials' ||
    !token.letters.startsWith('sc') ||
    token.letters === 'sc' ||
    companyLetters.has(token.letters)
  ) {
    return [token];
  }
  const rest = token.letters.slice(2);
  return rest.length > 1 ? [{ letters: rest, kind: 'initials' }] : asKept([rest]);
}

// A run of lone letters is a form only as the whole start or end of the name: inside, "S. A."
// may be a person's initials and "s-a" a verb.
function stripInside(tokens: readonly Token[]) {
  const runEnd = letterRunEnd(tokens, 0, tokens.length);
  const runStart = letterRunStart(tokens, 0, tokens.length);
  const opensWithForm = runEnd > 0 && insideLetters.has(letters(tokens.slice(0, runEnd)));
  const closesWithForm =
    runStart < tokens.length && insideLetters.has(letters(tokens.slice(runStart)));
  return tokens.flatMap((token, index): Token[] => {
    if (token.kind === 'letter') {
      const stripped = (opensWithForm && index < runEnd) || (closesWithForm && index >= runStart);
      return stripped ? [] : [token];
    }
    if (formAt([token], 0, insideForms, false)) return [];
    return withoutOpening(token);
  });
}

function runForm(tokens: readonly Token[], start: number, end: number) {
  if (end <= start) return null;
  const run = letters(tokens.slice(start, end));
  return companyForms.find((form) => lettersIn([form]).has(run)) ?? null;
}

function prefixEnd(tokens: Token[]) {
  const written = formAt(tokens, 0, [opening], true);
  if (written) return written.length;
  const runEnd = letterRunEnd(tokens, 0, tokens.length);
  if (runEnd < tokens.length && letters(tokens.slice(0, runEnd)) === 'sc') return runEnd;
  if (tokens[0]) tokens.splice(0, 1, ...withoutOpening(tokens[0]));
  return 0;
}

export interface CompanyName {
  // Initials stay one word, so "S.C.M. Impex" and "SCM Impex" are written alike.
  words: string[];
  // Null when the name carries no form, which then fits any.
  form: { id: string; standsFor: readonly string[] } | null;
  bare: boolean;
}

// A name carries one form besides the old "S.C." prefix, at its end or else at its start, so
// "SCM Impex SRL" keeps SCM as part of its name. `asWords` keeps a bare form as a word of it.
export function companyName(value: string, asWords = false): CompanyName {
  const tokens = tokenize(value);
  let first = prefixEnd(tokens);
  let last = tokens.length;
  let found: Found | null = null;
  const closingRun = letterRunStart(tokens, first + 1, last);
  const closing = formEndingAt(tokens, first + 1, last, companyForms, true);
  const closingLetters = runForm(tokens, closingRun, last);
  const closingBare = closing !== null && closing.bare && closing.form.alsoAWord === true;
  if (closing && !(asWords && closingBare)) {
    found = { ...closing, bare: closingBare };
    last -= closing.length;
  } else if (closingLetters) {
    found = { length: last - closingRun, form: closingLetters, bare: false };
    last = closingRun;
  } else {
    const openingRun = letterRunEnd(tokens, first, last - 1);
    const opened = formAt(tokens.slice(0, last - 1), first, companyForms, true);
    const openingLetters = runForm(tokens, first, openingRun);
    if (opened && !(asWords && opened.bare)) {
      found = opened;
      first += opened.length;
    } else if (openingLetters) {
      found = { length: openingRun - first, form: openingLetters, bare: false };
      first = openingRun;
    }
  }
  let named = stripInside(tokens.slice(first, last));
  if (found?.form.medical) named = named.filter((token) => token.letters !== 'dr');
  const words = named.map((token) => token.letters);
  if (words.length === 0) {
    return { words: foldText(value).split(' ').filter(Boolean), form: null, bare: false };
  }
  const form = found && { id: found.form.id, standsFor: found.form.standsFor ?? [] };
  return { words, form, bare: found?.bare ?? false };
}

// Two names spelled alike, the old "S.C." prefix aside, as ANAF never writes it.
export function spellingKey(value: string) {
  const tokens = tokenize(value);
  const key = letters(tokens.slice(prefixEnd(tokens)));
  return key || letters(tokenize(value));
}

/**
 * Whether a text names the company, its name written with a legal form beside it, so a bare
 * surname of a notary's or a doctor's office does not count.
 */
export function namesCompany(text: string, legalName: string) {
  const company = companyName(legalName);
  if (!company.form || company.words.join('').length < 3) return false;
  const tokens = tokenize(text);
  const words = tokens.map((token) => token.letters);
  const fits = (found: Found | null) =>
    found !== null &&
    (found.form.id === company.form!.id ||
      (found.form.standsFor ?? []).includes(company.form!.id) ||
      company.form!.standsFor.includes(found.form.id));
  for (let at = 0; at + company.words.length <= words.length; at++) {
    if (!company.words.every((word, offset) => words[at + offset] === word)) continue;
    const end = at + company.words.length;
    const before = at > 0 && words[at - 1] === 'dr' ? at - 1 : at;
    if (fits(formEndingAt(tokens, 0, before, companyForms, true))) return true;
    if (fits(formAt(tokens, end, companyForms, true))) return true;
  }
  return false;
}

const searchForms = legalForms.filter((form) => form.standsFor === undefined);
const searchLetters = lettersIn(searchForms);

// Letters typed in a search may run a form into a name ("S.C.A.B. S.R.L."). An opening form is
// read as the shortest one, as "S.C." opens most names; a closing one as the longest.
function lettersLeft(tokens: readonly Token[], fromStart: boolean, fromEnd: boolean) {
  const all = tokens.flatMap((token) => [...token.letters]);
  if (searchLetters.has(all.join(''))) return [];
  let start = 0;
  let end = all.length;
  if (fromStart) {
    for (let length = 2; length < end; length++) {
      if (searchLetters.has(all.slice(0, length).join(''))) {
        start = length;
        break;
      }
    }
  }
  if (fromEnd) {
    for (let length = end - start - 1; length >= 2; length--) {
      if (searchLetters.has(all.slice(end - length, end).join(''))) {
        end -= length;
        break;
      }
    }
  }
  return all.slice(start, end);
}

function lettersAt(tokens: readonly Token[], at: number, end: number) {
  return tokens[at]?.kind === 'initials' ? at + 1 : letterRunEnd(tokens, at, end);
}

function lettersBefore(tokens: readonly Token[], first: number, end: number) {
  return tokens[end - 1]?.kind === 'initials' ? end - 1 : letterRunStart(tokens, first, end);
}

export function searchWithoutLegalForms(value: string) {
  const kept = tokenize(value);
  let first = 0;
  for (let stripped = true; stripped && first < kept.length;) {
    stripped = false;
    const opened = formAt(kept, first, searchForms, true);
    if (opened) {
      first += opened.length;
      stripped = true;
      continue;
    }
    const closed = formEndingAt(kept, first, kept.length, searchForms, true);
    if (closed) {
      kept.length -= closed.length;
      stripped = true;
      continue;
    }
    const runs = [
      [first, lettersAt(kept, first, kept.length)],
      [lettersBefore(kept, first, kept.length), kept.length],
    ] as const;
    for (const [start, end] of runs) {
      if (end <= start) continue;
      const run = kept.slice(start, end);
      const left = lettersLeft(run, start === first, end === kept.length);
      if (left.length < letters(run).length) {
        kept.splice(start, end - start, ...asKept(left));
        stripped = true;
        break;
      }
    }
  }
  return splitWords(kept.slice(first));
}
