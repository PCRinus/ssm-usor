import { paragraphsOf } from '@ssm-usor/document-engine';
import PizZip from 'pizzip';

export interface QuoteRange {
  file: string;
  paragraph: number;
  lastParagraph: number;
}

export interface Candidate {
  file: string;
  paragraph: number;
  text: string;
  score: number;
}

const stopwords = new Set(
  [
    'pentru',
    'care',
    'este',
    'sunt',
    'acest',
    'aceasta',
    'acestea',
    'acestei',
    'acestor',
    'acesta',
    'prin',
    'catre',
    'intre',
    'dupa',
    'pana',
    'fara',
    'asupra',
    'precum',
    'cele',
    'celor',
    'unei',
    'unui',
    'fiind',
    'avand',
    'toate',
    'orice',
    'cazul',
    'conform',
    'privind',
    'potrivit',
    'prevazute',
    'prevederile',
    'legii',
    'legea',
  ].map((word) => word.slice(0, 6))
);

// Romanian inflects at the end ("motocicletelor", "motocicliștii"), so a word's first six
// letters stand for it; no stemmer for Romanian is worth a dependency here.
export function stemsOf(text: string) {
  const folded = text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  return new Set(
    [...folded.matchAll(/\p{L}{4,}/gu)]
      .map(([word]) => word.slice(0, 6))
      .filter((stem) => !stopwords.has(stem))
  );
}

export interface ChangedUnit {
  old: string | null;
  new: string | null;
}

export function candidateParagraphs(
  file: string,
  source: Uint8Array,
  units: ChangedUnit[],
  quotes: QuoteRange[],
  { limit = 8, minimum = 4 } = {}
): Candidate[] {
  const law = new Set<string>();
  const touched = new Set<string>();
  for (const unit of units) {
    const before = stemsOf(unit.old ?? '');
    const after = stemsOf(unit.new ?? '');
    for (const stem of [...before, ...after]) law.add(stem);
    for (const stem of after) if (!before.has(stem)) touched.add(stem);
    for (const stem of before) if (!after.has(stem)) touched.add(stem);
  }
  const quoted = quotes.filter((quote) => quote.file === file);
  const xml = new PizZip(source).file('word/document.xml')?.asText() ?? '';
  return (
    paragraphsOf(xml)
      .map(({ text }, paragraph) => ({ text: text.trim(), paragraph }))
      .filter(
        ({ text, paragraph }) =>
          text.length > 0 &&
          !quoted.some((quote) => paragraph >= quote.paragraph && paragraph <= quote.lastParagraph)
      )
      .map(({ text, paragraph }) => {
        const shared = [...stemsOf(text)].filter((stem) => law.has(stem));
        const subject = shared.filter((stem) => !touched.has(stem)).length;
        return { file, paragraph, text, subject, score: subject + 2 * (shared.length - subject) };
      })
      // A paragraph that shares only the words the change brought ("categorie", "corespunzător")
      // speaks of something else.
      .filter((candidate) => candidate.subject >= 2 && candidate.score >= minimum)
      .map(({ file, paragraph, text, score }) => ({ file, paragraph, text, score }))
      .sort((a, b) => b.score - a.score || a.paragraph - b.paragraph)
      .slice(0, limit)
      .sort((a, b) => a.paragraph - b.paragraph)
  );
}
