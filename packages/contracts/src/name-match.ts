import { foldText } from './fold-text';
import { withoutLegalForms } from './legal-forms';

const marks = /\p{M}/gu;
// "Dr." only with its dot: "DR" alone may be a company's initials, as in "DR Construct SRL".
const honorifics = /(?<![\p{L}\p{N}])(?:(?:d-na|d-l|dl)(?![\p{L}\p{N}])|dr\.)/gu;

// A name that is nothing but a legal form keeps it, or every such name would be the same.
export function foldName(value: string) {
  const plain = value.normalize('NFD').toLowerCase().replace(marks, '').replace(honorifics, ' ');
  const words = withoutLegalForms(plain, 'anywhere');
  return words.length > 0 ? words.join(' ') : foldText(plain);
}

function nameTokens(value: string) {
  return new Set(foldName(value).split(' ').filter(Boolean));
}

export function similar(a: string, b: string) {
  const x = nameTokens(a);
  const y = nameTokens(b);
  if (x.size === 0 || y.size === 0) return 0;
  const shared = [...x].filter((token) => y.has(token)).length;
  return shared / Math.max(x.size, y.size);
}

// No prefix rule, which is for workplaces: "Protect SRL" is not "Protecție Construct SRL".
export function sameName(a: string, b: string) {
  return foldName(a) === foldName(b) || similar(a, b) >= 0.8;
}
