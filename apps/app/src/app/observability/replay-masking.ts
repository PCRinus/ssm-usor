const maskAttribute = 'data-replay-mask';
const shapeAttribute = 'data-replay-shape';
const showAttribute = 'data-replay-show';

export const replayMask = { [maskAttribute]: '' } as const;
export const replayShape = { [shapeAttribute]: '' } as const;
// A field plays masked unless it, or an element around it, carries this: only fields with the
// organization's own data do, because a field left unmarked could hold a person's.
export const replayShow = { [showAttribute]: '' } as const;

const maskSelector = `[${maskAttribute}]`;
const shapeSelector = `[${shapeAttribute}]`;
const showSelector = `[${showAttribute}]`;

const addressWords = new Set([
  'aleea',
  'ap',
  'apartament',
  'b-dul',
  'bd',
  'bdul',
  'bl',
  'bloc',
  'bulevardul',
  'calea',
  'cart',
  'cartier',
  'cartierul',
  'com',
  'comuna',
  'et',
  'etaj',
  'intrarea',
  'jud',
  'judet',
  'judetul',
  'loc',
  'localitatea',
  'mun',
  'municipiul',
  'nr',
  'oras',
  'orasul',
  'piata',
  'sat',
  'satul',
  'sc',
  'scara',
  'sector',
  'sectorul',
  'sos',
  'soseaua',
  'splaiul',
  'str',
  'strada',
]);

function plain(word: string) {
  return word.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

export function shapeOf(text: string) {
  return text.replace(/[\p{L}\p{M}\p{N}]+(?:-[\p{L}\p{M}\p{N}]+)*/gu, (word) =>
    addressWords.has(plain(word))
      ? word
      : word
          .normalize('NFC')
          .replace(/\p{M}/gu, '')
          .replace(/\p{L}/gu, (letter) => (/[\p{Lu}\p{Lt}]/u.test(letter) ? 'X' : 'x'))
          .replace(/\p{N}/gu, '0')
  );
}

const asterisks = (text: string) => text.replace(/\S/g, '*');

const personalPatterns = [
  /(?<!\d)[1-9]\d{12}(?!\d)/g,
  /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+/gu,
  /(?<![\d+])(?:\+40|0040|0)[\s.-]?(?:\(0\)[\s.-]?)?[237](?:[\s.-]?\d){8}(?!\d)/g,
];

// Names have no pattern; the markers carry them. This catches a CNP, an email address or a
// phone number that shows where no marker was placed.
export function maskPersonalPatterns(text: string) {
  return personalPatterns.reduce((masked, pattern) => masked.replace(pattern, asterisks), text);
}

// A shadow root holds PostHog's own support chat, whose messages can say anything.
function outsideTheDocument(element: Element) {
  return element.getRootNode() !== element.ownerDocument;
}

// The page title names the open record, a person on a worker's page.
export function maskReplayText(text: string, element?: Element | null) {
  if (!element || element.tagName === 'TITLE' || outsideTheDocument(element)) {
    return asterisks(text);
  }
  if (element.closest(maskSelector)) return asterisks(text);
  if (element.closest(shapeSelector)) return shapeOf(text);
  return maskPersonalPatterns(text);
}

function isPassword(element: Element) {
  return (
    (element instanceof HTMLInputElement && element.type === 'password') ||
    element.hasAttribute('data-rr-is-password') ||
    /password/i.test(element.getAttribute('autocomplete') ?? '')
  );
}

export function maskReplayInput(text: string, element?: Element | null) {
  if (!element || isPassword(element) || outsideTheDocument(element))
    return '*'.repeat(text.length);
  if (element.closest(maskSelector)) return '*'.repeat(text.length);
  if (element.closest(shapeSelector)) return shapeOf(text);
  if (element.closest(showSelector)) return maskPersonalPatterns(text);
  return '*'.repeat(text.length);
}
