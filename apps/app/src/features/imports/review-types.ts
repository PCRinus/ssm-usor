export type Source = { file: string; quote: string };
export type LabelledSource = Source & {
  // What the passage proves, when it is one value of its item rather than the item itself.
  label?: string;
  // The post or room the passage stands under, which tells apart a table row repeated for each.
  near?: string;
};

export type SectionStatus =
  | { kind: 'choice' }
  | { kind: 'missing'; count: number }
  | { kind: 'invalid'; count: number }
  | { kind: 'check' }
  | { kind: 'done' };

const words = (text: string) =>
  text
    .normalize('NFC')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

const withoutMarks = (text: string) =>
  text.normalize('NFD').replace(/\p{M}/gu, '').normalize('NFC');

/** What the import corrected in a value the document writes otherwise. */
export function spellingCorrection(value: string, written: string) {
  const corrected = words(value);
  const original = words(written);
  const capitals = withoutMarks(corrected) !== withoutMarks(original);
  const diacritics = corrected.toLowerCase() !== original.toLowerCase();
  if (capitals && diacritics) return 'majuscule și diacritice';
  return capitals ? 'majuscule' : 'diacritice';
}
