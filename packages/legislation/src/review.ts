import {
  type ActText,
  type ActUnit,
  plainLabel,
  unitLines,
  type UnitMatch,
  unitsOf,
} from './act-text';
import {
  children,
  type CitedPassage,
  findPoint,
  type Locator,
  parseLocator,
  selectAlineate,
} from './locator';
import { actTokenOf, type AlineatDifference, compareTexts, type QuoteComparison } from './quotes';

type Candidate = { lines: string[]; excerpt: boolean; alternatives?: string[][] };

function ownLines(unit: ActUnit) {
  const lines: string[] = [];
  for (const item of unit.content) {
    if (typeof item !== 'string') break;
    lines.push(item);
  }
  return lines;
}

function articleCandidate(article: ActUnit, locator: Locator): Candidate | null {
  if (locator.letters.length > 0) {
    const holder =
      locator.alineate.list.length > 0
        ? children(article, 'alineat').find(
            (unit) => plainLabel(unit.label) === locator.alineate.list[0]
          )
        : article;
    if (!holder) return null;
    const letters = locator.letters.map((label) =>
      children(holder, 'letter').find((unit) => plainLabel(unit.label) === label)
    );
    if (letters.some((letter) => !letter)) return null;
    const intro = ownLines(holder);
    if (holder.kind === 'alineat' && intro.length > 0) intro[0] = `(${holder.label}) ${intro[0]}`;
    return { lines: [...intro, ...letters.flatMap((letter) => unitLines(letter!))], excerpt: true };
  }
  if (locator.point) {
    const point = findPoint(article, locator.point);
    // An amending act's points are often plain paragraphs, "1. La articolul 80^1 …".
    return { lines: unitLines(point ?? article), excerpt: true };
  }
  if (locator.alineate.list.length > 0) {
    const alineate = selectAlineate(article, locator.alineate);
    if (alineate.some((unit) => !unit)) return null;
    return { lines: alineate.flatMap((unit) => unitLines(unit!)), excerpt: false };
  }
  const body = unitLines(article);
  return {
    lines: body,
    excerpt: false,
    alternatives: article.heading ? [[article.heading, ...body]] : [],
  };
}

export type LocatedQuote = {
  // Null when the quote was found only in the act's text as a whole.
  match: UnitMatch | null;
  current: string;
  comparison: QuoteComparison;
};

const weight = (comparison: QuoteComparison) =>
  comparison.differences
    .flatMap((difference) => difference.changes)
    .reduce(
      (sum, change) =>
        sum + Math.max(change.template.split(/\s+/).length, change.current.split(/\s+/).length),
      0
    );

export function locateQuote(text: ActText, citation: CitedPassage): LocatedQuote | null {
  const locator = citation.locator ? parseLocator(citation.locator) : null;
  if (!locator || !citation.text) return null;
  const actToken = actTokenOf(citation.act);
  const options: { match: UnitMatch | null; candidate: Candidate }[] = [];
  if (locator.annex) {
    for (const match of unitsOf(text, 'annex', locator.annex)) {
      options.push({
        match,
        candidate: { lines: unitLines(match.unit, { heading: true }), excerpt: true },
      });
    }
  } else if (locator.articles.length === 0 && locator.point) {
    const walk = (units: (string | ActUnit)[]) => {
      for (const unit of units) {
        if (typeof unit === 'string') continue;
        if (unit.kind === 'point' && plainLabel(unit.label) === locator.point) {
          options.push({
            match: { unit, annex: null, ancestors: [] },
            candidate: { lines: unitLines(unit), excerpt: true },
          });
        }
        walk(unit.content);
      }
    };
    walk(text.content);
    if (options.length === 0) {
      const whole: ActUnit = {
        kind: 'block',
        label: '',
        heading: null,
        content: text.content,
        notes: [],
      };
      options.push({ match: null, candidate: { lines: unitLines(whole), excerpt: true } });
    }
  } else {
    const [first, ...others] = locator.articles;
    for (const match of unitsOf(text, 'article', first!)) {
      const candidate = articleCandidate(match.unit, locator);
      if (!candidate) continue;
      for (const label of others) {
        const next = unitsOf(text, 'article', label).find((other) => other.annex === match.annex);
        if (next) candidate.lines.push(...unitLines(next.unit));
      }
      options.push({ match, candidate });
    }
  }
  let best: LocatedQuote | null = null;
  for (const { match, candidate } of options) {
    for (const lines of [candidate.lines, ...(candidate.alternatives ?? [])]) {
      const current = lines.join('\n');
      const comparison = compareTexts(citation.text, current, {
        actToken,
        excerpt: candidate.excerpt,
        article: locator.articles[0] ?? null,
      });
      if (
        !best ||
        weight(comparison) < weight(best.comparison) ||
        (weight(comparison) === weight(best.comparison) &&
          comparison.similarity > best.comparison.similarity)
      ) {
        best = { match, current, comparison };
      }
    }
  }
  return best;
}

export type QuoteReview<C extends CitedPassage = CitedPassage> =
  | { citation: C; status: 'matches'; similarity: number }
  | { citation: C; status: 'differs'; similarity: number; differences: AlineatDifference[] }
  | { citation: C; status: 'not_located'; similarity: number | null };

// Below this share of its words found, a quote is taken to be somewhere else, not changed.
export const locatedAt = 0.5;

// The templates' words against the law's current words, for a review by hand: the provider's
// rewording shows up here, which is why a change is detected by comparing the law with itself.
export function reviewQuotes<C extends CitedPassage>(text: ActText, citations: C[]) {
  const located = new Map<string, LocatedQuote | null>();
  return citations
    .filter((citation) => citation.form === 'quote' && citation.text?.trim())
    .map((citation): QuoteReview<C> => {
      const key = `${citation.act}\n${citation.locator}\n${citation.text}`;
      if (!located.has(key)) located.set(key, locateQuote(text, citation));
      const found = located.get(key)!;
      if (!found || found.comparison.similarity < locatedAt) {
        return {
          citation,
          status: 'not_located',
          similarity: found?.comparison.similarity ?? null,
        };
      }
      const { similarity, differences } = found.comparison;
      return differences.length > 0
        ? { citation, status: 'differs', similarity, differences }
        : { citation, status: 'matches', similarity };
    });
}
