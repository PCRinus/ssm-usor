import { foldText } from './fold-text';

export interface LegalForm {
  initials: readonly string[];
  spelledOut: readonly string[];
  // "II" numbers a building ("Hala II") and "IF" stands inside names ("Casa IF Design"), so
  // written as one word, without points, they count only at an end of a search.
  alsoAWord?: true;
}

export const legalForms: readonly LegalForm[] = [
  { initials: ['SC'], spelledOut: ['societate comercială'] },
  { initials: ['SRL'], spelledOut: ['societate cu răspundere limitată'] },
  { initials: ['SRL-D'], spelledOut: ['societate cu răspundere limitată debutant'] },
  { initials: ['SA'], spelledOut: ['societate pe acțiuni'] },
  { initials: ['SNC'], spelledOut: ['societate în nume colectiv'] },
  { initials: ['SCS'], spelledOut: ['societate în comandită simplă'] },
  {
    initials: ['SCA'],
    spelledOut: ['societate în comandită pe acțiuni', 'societate civilă de avocați'],
  },
  { initials: ['PFA'], spelledOut: ['persoană fizică autorizată'] },
  { initials: ['II'], spelledOut: ['întreprindere individuală'], alsoAWord: true },
  { initials: ['IF'], spelledOut: ['întreprindere familială'], alsoAWord: true },
  {
    initials: ['SCM'],
    spelledOut: ['societate civilă medicală', 'societate cooperativă meșteșugărească'],
  },
  { initials: ['CMI'], spelledOut: ['cabinet medical individual'] },
  { initials: [], spelledOut: ['cabinete medicale grupate', 'cabinete medicale asociate'] },
  { initials: ['BIN'], spelledOut: ['birou individual notarial'] },
  { initials: ['SPN'], spelledOut: ['societate profesională notarială'] },
  { initials: [], spelledOut: ['cabinet de avocat', 'cabinete de avocat asociate'] },
  { initials: ['SCPA'], spelledOut: ['societate civilă profesională de avocați'] },
  { initials: ['SPARL'], spelledOut: ['societate profesională de avocați cu răspundere limitată'] },
  {
    initials: ['BEJ'],
    spelledOut: [
      'birou executor judecătoresc',
      'birou de executor judecătoresc',
      'birou executorului judecătoresc',
    ],
  },
  {
    initials: ['SCPEJ'],
    spelledOut: ['societate civilă profesională de executori judecătorești'],
  },
  { initials: ['CII'], spelledOut: ['cabinet individual de insolvență'] },
  {
    initials: ['SPRL'],
    spelledOut: [
      'societate profesională cu răspundere limitată',
      'societate civilă profesională cu răspundere limitată',
    ],
  },
  {
    initials: ['IPURL'],
    spelledOut: ['întreprindere profesională unipersonală cu răspundere limitată'],
  },
];

const phrases = legalForms
  .flatMap((form) => form.spelledOut.map((phrase) => foldText(phrase).split(' ')))
  .sort((a, b) => b.length - a.length);

const writtenInitials = legalForms
  .flatMap((form) =>
    form.initials.map((initials) => ({
      parts: foldText(initials).split(' '),
      alsoAWord: form.alsoAWord === true,
    }))
  )
  .sort((a, b) => b.parts.join('').length - a.parts.join('').length);

const initialLetters = new Set(writtenInitials.map(({ parts }) => parts.join('')));

// The head noun takes the article: Societatea, Biroul, Cabinetul, Cabinetele.
const articles = ['', 'a', 'l', 'ul', 'le'];

interface Token {
  letters: string;
  // `initials` are letters joined by dots ("S.R.L."), `letter` one letter standing alone, and
  // `kept` the letters left of initials that only started or ended with a form.
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

type Where = 'anywhere' | 'ends';

function formAt(tokens: readonly Token[], at: number, where: Where) {
  for (const phrase of phrases) {
    const found = phrase.every((word, offset) => {
      const token = tokens[at + offset];
      if (token?.kind !== 'word') return false;
      return offset === 0
        ? articles.some((article) => token.letters === word + article)
        : token.letters === word;
    });
    if (found) return phrase.length;
  }
  for (const { parts, alsoAWord } of writtenInitials) {
    if (parts.length === 1) {
      const token = tokens[at];
      const asWritten =
        token?.kind === 'initials' || (token?.kind === 'word' && (where === 'ends' || !alsoAWord));
      if (asWritten && token.letters === parts[0]) return 1;
    } else if (
      parts.every((part, offset) => {
        const token = tokens[at + offset];
        return token !== undefined && token.kind !== 'kept' && token.letters === part;
      })
    ) {
      return parts.length;
    }
  }
  return 0;
}

const longestForm = Math.max(...phrases.map((phrase) => phrase.length), 2);

function formEndingAt(tokens: readonly Token[], first: number, end: number) {
  const before = tokens.slice(0, end);
  for (let length = Math.min(longestForm, end - first); length > 0; length--) {
    if (formAt(before, end - length, 'ends') === length) return length;
  }
  return 0;
}

function lettersEnd(tokens: readonly Token[], at: number, end: number) {
  const token = tokens[at];
  if (token?.kind === 'initials') return at + 1;
  let next = at;
  while (next < end && tokens[next]!.kind === 'letter') next++;
  return next;
}

// Letters may run a form into a name ("S.C.A.B. S.R.L."). An opening form is read as the
// shortest one, as "S.C." opens most names; a closing one as the longest.
function lettersLeft(tokens: readonly Token[], opening: boolean, closing: boolean) {
  const letters = tokens.flatMap((token) => [...token.letters]);
  if (initialLetters.has(letters.join(''))) return [];
  let start = 0;
  let end = letters.length;
  if (opening) {
    for (let length = 2; length < end; length++) {
      if (initialLetters.has(letters.slice(0, length).join(''))) {
        start = length;
        break;
      }
    }
  }
  if (closing) {
    for (let length = end - start - 1; length >= 2; length--) {
      if (initialLetters.has(letters.slice(end - length, end).join(''))) {
        end -= length;
        break;
      }
    }
  }
  return letters.slice(start, end);
}

const asKept = (letters: string[]): Token[] =>
  letters.map((letter) => ({ letters: letter, kind: 'kept' }));

function wordsOf(tokens: readonly Token[]) {
  return tokens.flatMap((token) =>
    token.kind === 'initials' ? [...token.letters] : [token.letters]
  );
}

function strippedAnywhere(tokens: readonly Token[]) {
  const kept: Token[] = [];
  for (let at = 0; at < tokens.length;) {
    const form = formAt(tokens, at, 'anywhere');
    if (form > 0) {
      at += form;
      continue;
    }
    const end = lettersEnd(tokens, at, tokens.length);
    if (end > at) {
      kept.push(...asKept(lettersLeft(tokens.slice(at, end), true, true)));
      at = end;
      continue;
    }
    kept.push(tokens[at]!);
    at += 1;
  }
  return kept;
}

function lettersStart(tokens: readonly Token[], first: number, end: number) {
  if (tokens[end - 1]?.kind === 'initials') return end - 1;
  let start = end;
  while (start > first && tokens[start - 1]!.kind === 'letter') start--;
  return start;
}

const letterCount = (tokens: readonly Token[]) =>
  tokens.reduce((count, token) => count + token.letters.length, 0);

function strippedAtEnds(tokens: readonly Token[]) {
  const kept = [...tokens];
  let first = 0;
  for (let stripped = true; stripped && first < kept.length;) {
    stripped = false;
    const opening = formAt(kept, first, 'ends');
    if (opening > 0) {
      first += opening;
      stripped = true;
      continue;
    }
    const closing = formEndingAt(kept, first, kept.length);
    if (closing > 0) {
      kept.length -= closing;
      stripped = true;
      continue;
    }
    const runs = [
      [first, lettersEnd(kept, first, kept.length)],
      [lettersStart(kept, first, kept.length), kept.length],
    ] as const;
    for (const [start, end] of runs) {
      if (end <= start) continue;
      const run = kept.slice(start, end);
      const left = lettersLeft(run, start === first, end === kept.length);
      if (left.length < letterCount(run)) {
        kept.splice(start, end - start, ...asKept(left));
        stripped = true;
        break;
      }
    }
  }
  return kept.slice(first);
}

// `ends` leaves a form inside a name, where its letters may be a word, as in "Casa IF Design".
export function withoutLegalForms(value: string, where: Where) {
  const tokens = tokenize(value);
  return wordsOf(where === 'anywhere' ? strippedAnywhere(tokens) : strippedAtEnds(tokens));
}
