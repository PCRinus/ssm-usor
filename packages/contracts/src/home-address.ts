import { romanianCounties } from './counties';
import { foldText } from './fold-text';

type PlaceKind = 'locality' | 'county' | 'street' | 'plain';
type NumberKind = 'nr' | 'bl' | 'sc' | 'et' | 'ap' | 'sector';

interface Place {
  kind: PlaceKind;
  text: string;
}

interface ParsedAddress {
  places: Place[];
  numbers: string[];
}

const labels: Record<string, PlaceKind | NumberKind> = {
  loc: 'locality',
  localitatea: 'locality',
  mun: 'locality',
  municipiul: 'locality',
  oras: 'locality',
  orasul: 'locality',
  com: 'locality',
  comuna: 'locality',
  sat: 'locality',
  satul: 'locality',
  jud: 'county',
  judet: 'county',
  judetul: 'county',
  str: 'street',
  strada: 'street',
  nr: 'nr',
  numar: 'nr',
  numarul: 'nr',
  bl: 'bl',
  bloc: 'bl',
  blocul: 'bl',
  sc: 'sc',
  scara: 'sc',
  et: 'et',
  etaj: 'et',
  etajul: 'et',
  ap: 'ap',
  apartament: 'ap',
  apartamentul: 'ap',
  sect: 'sector',
  sector: 'sector',
  sectorul: 'sector',
};

// "Strada" is what a street is unless said otherwise, so it may be left out; "Calea Turzii" is
// not "Strada Turzii", so the other types stay in the street's name.
const streetTypes: Record<string, string> = {
  bd: 'bulevardul',
  bdul: 'bulevardul',
  bulevard: 'bulevardul',
  bulevardul: 'bulevardul',
  calea: 'calea',
  sos: 'soseaua',
  soseaua: 'soseaua',
  aleea: 'aleea',
  piata: 'piata',
  pta: 'piata',
  splaiul: 'splaiul',
  intrarea: 'intrarea',
};

const numberKinds = new Set<string>(['nr', 'bl', 'sc', 'et', 'ap', 'sector']);

const countyNames = new Set(romanianCounties.map((county) => foldText(county.name)));

const hasDigit = (word: string) => /\p{N}/u.test(word);

function words(part: string) {
  return foldText(part)
    .replace(/(^| )b dul(?= |$)/g, '$1bdul')
    .replace(/(^| )p ta(?= |$)/g, '$1piata')
    .replace(/(^| )(nr|bl|sc|et|ap)(?=\p{N})/gu, '$1$2 ')
    .split(' ')
    .filter((word) => word !== '');
}

// Where "horea 12 a" starts its house number; the length when it has none.
function numberStart(split: readonly string[]) {
  let start = split.length;
  const numeric = (index: number) =>
    hasDigit(split[index]!) ||
    (split[index]!.length === 1 && index > 0 && hasDigit(split[index - 1]!));
  while (start > 1 && numeric(start - 1)) start -= 1;
  return split.slice(start).some(hasDigit) ? start : split.length;
}

function parse(value: string): ParsedAddress {
  const places: Place[] = [];
  const numbers = new Map<string, string>();
  for (const part of value.split(/[,;\n]/)) {
    let kind: PlaceKind | NumberKind = 'plain';
    let text: string[] = [];
    const close = () => {
      if (text.length === 0) return;
      if (numberKinds.has(kind)) numbers.set(kind, text.join(''));
      else places.push({ kind: kind as PlaceKind, text: text.join(' ') });
    };
    for (const word of words(part)) {
      const label = labels[word];
      if (label !== undefined || streetTypes[word] !== undefined) {
        close();
        kind = label ?? 'street';
        text = label === undefined ? [streetTypes[word]!] : [];
        continue;
      }
      // "nr. 12 A" and "nr. 12-14" are one number; "nr. 12 Cluj-Napoca" is a number and a place.
      if (numberKinds.has(kind) && text.length > 0 && word.length > 1 && !hasDigit(word)) {
        close();
        kind = 'plain';
        text = [];
      }
      text.push(word);
    }
    close();
  }
  if (!numbers.has('nr')) {
    for (const place of places) {
      if (place.kind !== 'street' && place.kind !== 'plain') continue;
      const split = place.text.split(' ');
      const start = numberStart(split);
      if (start === split.length) continue;
      numbers.set('nr', split.slice(start).join(''));
      place.text = split.slice(0, start).join(' ');
      break;
    }
  }
  return {
    places,
    numbers: [...numbers].map(([kind, number]) => `${kind} ${number}`).sort(),
  };
}

// A place written with a label pairs first with the same label, then with one written bare, and a
// county last: in "Mun. Buzău, jud. Buzău" a bare "Buzău" elsewhere is the town.
function unpaired(a: readonly Place[], b: readonly Place[]) {
  const restA = [...a];
  const restB = [...b];
  const pair = (fits: (x: Place, y: Place) => boolean) => {
    for (const x of [...restA]) {
      const index = restB.findIndex((y) => y.text === x.text && fits(x, y));
      if (index === -1) continue;
      restB.splice(index, 1);
      restA.splice(restA.indexOf(x), 1);
    }
  };
  const bare = (place: Place) => place.kind === 'plain';
  pair((x, y) => x.kind === y.kind);
  pair((x, y) => bare(x) !== bare(y) && x.kind !== 'county' && y.kind !== 'county');
  pair((x, y) => bare(x) || bare(y));
  return [restA, restB] as const;
}

const countyLike = (place: Place) =>
  place.kind === 'county' || (place.kind === 'plain' && countyNames.has(place.text));

// A block or flat on one reading alone may be more detail or a move, so it keeps them apart for the
// member to choose; a county on one reading alone is only more detail.
export function sameHomeAddress(a: string, b: string) {
  if (foldText(a) === foldText(b)) return true;
  const x = parse(a);
  const y = parse(b);
  if ([x, y].some((parsed) => parsed.places.length + parsed.numbers.length === 0)) return false;
  if (x.numbers.join('|') !== y.numbers.join('|')) return false;
  const [restX, restY] = unpaired(x.places, y.places);
  if (restX.length > 0 && restY.length > 0) return false;
  return [...restX, ...restY].every(countyLike);
}

export function homeAddressDetail(value: string) {
  const { places, numbers } = parse(value);
  return places.length + numbers.length;
}
