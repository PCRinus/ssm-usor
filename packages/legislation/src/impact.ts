import {
  type ActText,
  type ActUnit,
  isRepealed,
  plainLabel,
  unitLines,
  type UnitMatch,
  unitsOf,
} from './act-text';
import type { AmendingAct, AmendmentNote } from './amendments';
import { actTokenOf, type AlineatDifference, compareTexts, type QuoteComparison } from './quotes';

export type CitedPassage = {
  form: 'quote' | 'reference';
  act: string;
  article: string | null;
  locator: string | null;
  text: string | null;
};

export type Locator = {
  articles: string[];
  alineate: { list: string[]; range: boolean };
  letters: string[];
  point: string | null;
  annex: string | null;
};

const superscript = '[⁰¹²³⁴⁵⁶⁷⁸⁹]*';

export function parseLocator(locator: string): Locator | null {
  const annex = /^Anexa (\d+)$/.exec(locator);
  if (annex) {
    return {
      articles: [],
      alineate: { list: [], range: false },
      letters: [],
      point: null,
      annex: annex[1]!,
    };
  }
  const point = /^pct\. (\d+)$/.exec(locator);
  if (point) {
    return {
      articles: [],
      alineate: { list: [], range: false },
      letters: [],
      point: point[1]!,
      annex: null,
    };
  }
  const article = new RegExp(
    String.raw`^Art\. ((?:\d+${superscript}|[IVXLC]+)(?:, (?:\d+${superscript}|[IVXLC]+))*)` +
      String.raw`(?: alin\. ((?:\(\d+${superscript}\)(?:, | și | – |–)?)+))?` +
      String.raw`(?: lit\. ((?:[a-z]${superscript}\)(?:, | și )?)+))?(?:, pct\. (\d+))?`,
    'u'
  ).exec(locator);
  if (!article) return null;
  const alineate = article[2] ?? '';
  return {
    articles: article[1]!.split(', ').map(plainLabel),
    alineate: {
      list: [...alineate.matchAll(/\(([^)]+)\)/g)].map((match) => plainLabel(match[1]!)),
      range: alineate.includes('–'),
    },
    letters: [...(article[3] ?? '').matchAll(/([a-z][⁰¹²³⁴⁵⁶⁷⁸⁹]*)\)/gu)].map((match) =>
      plainLabel(match[1]!)
    ),
    point: article[4] ?? null,
    annex: null,
  };
}

type Candidate = { lines: string[]; excerpt: boolean; alternatives?: string[][] };

const children = (unit: ActUnit, kind: ActUnit['kind']) =>
  unit.content.filter((item): item is ActUnit => typeof item !== 'string' && item.kind === kind);

function ownLines(unit: ActUnit) {
  const lines: string[] = [];
  for (const item of unit.content) {
    if (typeof item !== 'string') break;
    lines.push(item);
  }
  return lines;
}

function selectAlineate(article: ActUnit, wanted: Locator['alineate']) {
  const alineate = children(article, 'alineat');
  if (!wanted.range) {
    return wanted.list.map((label) => alineate.find((unit) => plainLabel(unit.label) === label));
  }
  const first = alineate.findIndex((unit) => plainLabel(unit.label) === wanted.list[0]);
  const last = alineate.findIndex((unit) => plainLabel(unit.label) === wanted.list.at(-1));
  if (first < 0 || last < first) return [undefined];
  return alineate.slice(first, last + 1);
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

function findPoint(unit: ActUnit, label: string): ActUnit | null {
  for (const item of unit.content) {
    if (typeof item === 'string') continue;
    if (item.kind === 'point' && plainLabel(item.label) === label) return item;
    const found = findPoint(item, label);
    if (found) return found;
  }
  return null;
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

export type CitationImpact<C extends CitedPassage = CitedPassage> =
  | { citation: C; status: 'unaffected'; amendedSince: AmendmentNote[] }
  | {
      citation: C;
      status: 'quote_differs';
      similarity: number;
      differences: AlineatDifference[];
      amendedSince: AmendmentNote[];
    }
  | { citation: C; status: 'reference_touched'; missing: boolean; amendedSince: AmendmentNote[] }
  | { citation: C; status: 'not_located'; similarity: number | null };

export type ImpactOutcome = 'no_impact' | 'quote_differs' | 'needs_review';

export type Impact<C extends CitedPassage = CitedPassage> = {
  outcome: ImpactOutcome;
  citations: CitationImpact<C>[];
  amendedUnits: AmendmentNote[];
  amendingActs: AmendingAct[];
};

// Below this share of its words found, a quote is taken to be somewhere else, not changed.
export const locatedAt = 0.5;

function subtreeNotes(unit: ActUnit): AmendmentNote[] {
  return [
    ...unit.notes,
    ...unit.content.flatMap((item) => (typeof item === 'string' ? [] : subtreeNotes(item))),
  ];
}

function notesTouching(text: ActText, match: UnitMatch) {
  const label = plainLabel(match.unit.label);
  const notes = new Set([
    ...subtreeNotes(match.unit),
    ...match.ancestors.flatMap((ancestor) =>
      ancestor.notes.filter(
        (note) => note.operation === 'modified' || note.operation === 'repealed'
      )
    ),
    ...text.notes.filter(
      (note) =>
        match.unit.kind === 'article' &&
        note.named.article !== null &&
        plainLabel(note.named.article) === label &&
        note.path.annex === match.annex
    ),
  ]);
  return [...notes];
}

export function assessImpact<C extends CitedPassage>({
  actId,
  citations,
  text,
  since,
}: {
  actId: string;
  citations: C[];
  text: ActText;
  // The consolidated form the templates were last compared against; null when they never were,
  // and then every amendment the notes record counts.
  since: string | null;
}): Impact<C> {
  const after = (note: AmendmentNote) => since === null || note.date > since;
  const amendedUnits = text.notes.filter(after).sort((a, b) => b.date.localeCompare(a.date));
  const results: CitationImpact<C>[] = [];
  const quotes = new Map<string, LocatedQuote | null>();
  for (const citation of citations) {
    if (citation.act !== actId) continue;
    // A marker with no words after it, its text in a table the index does not read, can only be
    // checked as a reference to its article.
    if (citation.form === 'quote' && citation.text?.trim()) {
      const key = `${citation.locator}\n${citation.text}`;
      if (!quotes.has(key)) quotes.set(key, locateQuote(text, citation));
      const located = quotes.get(key)!;
      if (!located || located.comparison.similarity < locatedAt) {
        results.push({
          citation,
          status: 'not_located',
          similarity: located?.comparison.similarity ?? null,
        });
        continue;
      }
      const amendedSince = located.match ? notesTouching(text, located.match).filter(after) : [];
      if (located.comparison.differences.length > 0) {
        results.push({
          citation,
          status: 'quote_differs',
          similarity: located.comparison.similarity,
          differences: located.comparison.differences,
          amendedSince,
        });
      } else results.push({ citation, status: 'unaffected', amendedSince });
      continue;
    }
    if (citation.article === null) {
      results.push({ citation, status: 'unaffected', amendedSince: [] });
      continue;
    }
    const matches = unitsOf(text, 'article', citation.article);
    const amendedSince = [
      ...new Set(matches.flatMap((match) => notesTouching(text, match)).filter(after)),
    ];
    const missing = matches.length === 0 || matches.every((match) => isRepealed(match.unit));
    results.push(
      missing || amendedSince.length > 0
        ? { citation, status: 'reference_touched', missing, amendedSince }
        : { citation, status: 'unaffected', amendedSince }
    );
  }
  const outcome: ImpactOutcome = results.some((result) => result.status === 'quote_differs')
    ? 'quote_differs'
    : results.some(
          (result) => result.status === 'reference_touched' || result.status === 'not_located'
        )
      ? 'needs_review'
      : 'no_impact';
  const acts = new Map<string, AmendingAct>();
  for (const note of amendedUnits) {
    if (note.amendingAct && !acts.has(note.amendingAct.name)) {
      acts.set(note.amendingAct.name, note.amendingAct);
    }
  }
  return { outcome, citations: results, amendedUnits, amendingActs: [...acts.values()] };
}
