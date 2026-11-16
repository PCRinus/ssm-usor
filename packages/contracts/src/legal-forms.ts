import { foldText } from './fold-text';

interface LegalForm {
  // Two company names with forms of different ids are two companies.
  id: string;
  initials: readonly string[];
  spelledOut: readonly string[];
  // Dropped wherever they stand in any name, a person's or a workplace's too. The other forms
  // count only at an end of a company's name: inside one, "SCM", "Bin" or "bej" are words.
  inside?: true;
  // "II" numbers a building ("Hala II") and "IF" stands inside names ("Casa IF Design"): as a
  // bare word they count only at the end of a company's name or of a search.
  alsoAWord?: true;
  // A generic name ("birou notarial") fits the forms it stands for. "BNP" is also a bank's
  // initials, so such a form is read only when comparing companies, never in a search.
  standsFor?: readonly string[];
}

const cooperativeGrades = ['', ' de gradul 1', ' de gradul I', ' de gradul 2', ' de gradul II'];

const legalForms: readonly LegalForm[] = [
  { id: 'sc', initials: ['SC'], spelledOut: ['societate comercială'], inside: true },
  { id: 'srl', initials: ['SRL'], spelledOut: ['societate cu răspundere limitată'], inside: true },
  { id: 'srl', initials: ['SRL-D'], spelledOut: ['societate cu răspundere limitată debutant'] },
  { id: 'sa', initials: ['SA'], spelledOut: ['societate pe acțiuni'], inside: true },
  { id: 'snc', initials: ['SNC'], spelledOut: ['societate în nume colectiv'] },
  { id: 'scs', initials: ['SCS'], spelledOut: ['societate în comandită simplă'] },
  {
    id: 'sca',
    initials: ['SCA'],
    spelledOut: ['societate în comandită pe acțiuni', 'societate civilă de avocați'],
  },
  { id: 'pfa', initials: ['PFA'], spelledOut: ['persoană fizică autorizată'], inside: true },
  {
    id: 'ii',
    initials: ['II'],
    spelledOut: ['întreprindere individuală'],
    inside: true,
    alsoAWord: true,
  },
  {
    id: 'if',
    initials: ['IF'],
    spelledOut: ['întreprindere familială'],
    inside: true,
    alsoAWord: true,
  },
  {
    id: 'scm',
    initials: ['SCM'],
    spelledOut: [
      'societate civilă medicală',
      ...cooperativeGrades.map((grade) => `societate cooperativă meșteșugărească${grade}`),
      ...cooperativeGrades.map((grade) => `societate cooperativă${grade}`),
      'cooperativă meșteșugărească',
    ],
  },
  { id: 'cmi', initials: ['CMI'], spelledOut: ['cabinet medical individual'] },
  { id: 'cmg', initials: [], spelledOut: ['cabinete medicale grupate'] },
  { id: 'cma', initials: [], spelledOut: ['cabinete medicale asociate'] },
  { id: 'bin', initials: ['BIN'], spelledOut: ['birou individual notarial'] },
  { id: 'spn', initials: ['SPN'], spelledOut: ['societate profesională notarială'] },
  {
    id: 'bnp',
    initials: ['BNP'],
    spelledOut: ['birou notarial public', 'birou notarial'],
    standsFor: ['bin', 'spn'],
  },
  { id: 'cab', initials: [], spelledOut: ['cabinet de avocat'] },
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

interface Token {
  letters: string;
  // `initials` are letters joined by points ("S.R.L."), `letter` a letter standing alone, and
  // `kept` letters left of initials that only started with a form.
  kind: 'word' | 'letter' | 'initials' | 'kept';
}

const marks = /\p{M}/gu;
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

const wordsOf = (tokens: readonly Token[]) =>
  tokens.flatMap((token) => (token.kind === 'initials' ? [...token.letters] : [token.letters]));

const asKept = (letters: readonly string[]): Token[] =>
  letters.map((letter) => ({ letters: letter, kind: 'kept' }));

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

interface Found {
  length: number;
  form: LegalForm;
}

// The head noun takes the article: Societatea, Biroul, Cabinetul, Cabinetele.
const articles = ['', 'a', 'l', 'ul', 'le'];

function phraseAt(tokens: readonly Token[], at: number, phrase: readonly string[]) {
  return phrase.every((word, offset) => {
    const token = tokens[at + offset];
    if (token?.kind !== 'word' && token?.kind !== 'letter') return false;
    return offset === 0
      ? articles.some((article) => token.letters === word + article)
      : token.letters === word;
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
  const take = (length: number, form: LegalForm) => {
    if (!found || length > found.length) found = { length, form };
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
      if (asOne) take(1, form);
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

const formById = (id: string) => legalForms.find((form) => form.id === id)!;
const insideForms = legalForms.filter((form) => form.inside);
const insideLetters = lettersIn(insideForms);
const opening = formById('sc');

// "S.C." opens most old names, so initials that start with it ("S.C.A.B.") lose it.
function withoutOpening(token: Token): Token[] {
  if (token.kind !== 'initials' || !token.letters.startsWith('sc') || token.letters === 'sc') {
    return [token];
  }
  return asKept([...token.letters.slice(2)]);
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

export function withoutInsideForms(value: string) {
  return wordsOf(stripInside(tokenize(value)));
}

const companyForms = legalForms.filter((form) => form.id !== 'sc');

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
  words: string[];
  // Null when the name carries no form, which then fits any.
  form: { id: string; standsFor: readonly string[] } | null;
}

// A name carries one form besides the old "S.C." prefix, at its end or else at its start, so
// "SCM Impex SRL" keeps SCM as part of its name.
export function companyName(value: string): CompanyName {
  const tokens = tokenize(value);
  let first = prefixEnd(tokens);
  let last = tokens.length;
  let form: LegalForm | null = null;
  const closingRun = letterRunStart(tokens, first + 1, last);
  const closing = formEndingAt(tokens, first + 1, last, companyForms, true);
  const closingLetters = runForm(tokens, closingRun, last);
  if (closing) {
    form = closing.form;
    last -= closing.length;
  } else if (closingLetters) {
    form = closingLetters;
    last = closingRun;
  } else {
    const openingRun = letterRunEnd(tokens, first, last - 1);
    const opened = formAt(tokens.slice(0, last - 1), first, companyForms, true);
    const openingLetters = runForm(tokens, first, openingRun);
    if (opened) {
      form = opened.form;
      first += opened.length;
    } else if (openingLetters) {
      form = openingLetters;
      first = openingRun;
    }
    // The honorific of a doctor's office: "CMI Dr. Popescu Ion".
    if (form && tokens[first]?.letters === 'dr' && first + 1 < last) first += 1;
  }
  const words = wordsOf(stripInside(tokens.slice(first, last)));
  if (words.length === 0) return { words: foldText(value).split(' ').filter(Boolean), form: null };
  return { words, form: form && { id: form.id, standsFor: form.standsFor ?? [] } };
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
  return wordsOf(kept.slice(first));
}
