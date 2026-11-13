import PizZip from 'pizzip';

import acts from '../templates/legal-acts.json' with { type: 'json' };
import {
  type ActName,
  type Citation,
  markerLocatorSpan,
  parseMarker,
  templateCitations,
} from './citations';
import { conformLine, normalizeIncoming } from './legal-wording';
import { rewriteParagraph, type SuperscriptStyle } from './paragraph-edit';
import { type Paragraph, paragraphsOf, superscriptDigits } from './text';
import { diff, tokenize } from './token-diff';

export type QuotedCitation = Pick<Citation, 'file' | 'paragraph' | 'act' | 'locator' | 'text'>;

export interface QuoteReplacement {
  /** The quote as the citation index lists it; its text must still be the template's. */
  citation: QuotedCitation;
  /** The current wording, one line per alineat or letter, as `Citation.text` splits it. */
  lines: string[];
  /** The marker's new locator, when the passage gains or loses alineate at its ends. */
  locator?: string;
}

export interface LineChange {
  kind: 'changed' | 'added' | 'removed';
  /** In the template after the change; in the template before it for a removed line. */
  paragraph: number;
  before: string | null;
  after: string | null;
}

export interface QuoteReplacementSummary {
  file: string;
  act: string;
  locator: string;
  changes: LineChange[];
  notes: string[];
}

/**
 * The edit of one quote, by its paragraphs from the marker's: the new text of each, null to
 * remove it, and the paragraphs inserted after it. A copy of the passage in another template
 * reads the same, so the same plan applies to it.
 */
export interface QuotePlan {
  paragraphs: { text?: string | null; inserted: string[] }[];
  superscripts: SuperscriptStyle;
}

export interface QuoteReplacementOptions {
  /** Diacritic-less words the wording pass restores, `tools/import/wording.ro.json`'s words. */
  dictionary?: Record<string, string>;
}

const documentXml = (source: Uint8Array) =>
  new PizZip(source).file('word/document.xml')?.asText() ?? '';

function withDocumentXml(source: Uint8Array, xml: string) {
  const zip = new PizZip(source);
  zip.file('word/document.xml', xml);
  return zip.generate({ type: 'uint8array', compression: 'DEFLATE' });
}

const quotesOf = (source: Uint8Array, file: string) =>
  templateCitations({ manifest: 'ssm', file, typeKey: 'template', source }).filter(
    (citation) => citation.form === 'quote'
  );

export function findQuote(source: Uint8Array, citation: QuotedCitation): Citation {
  const found = quotesOf(source, citation.file)
    .filter(
      (each) =>
        each.act === citation.act &&
        each.locator === citation.locator &&
        each.text === citation.text
    )
    .sort(
      (a, b) =>
        Math.abs(a.paragraph - citation.paragraph) - Math.abs(b.paragraph - citation.paragraph)
    )[0];
  if (!found) {
    throw new Error(
      `${citation.file} quotes ${citation.act} ${citation.locator} no longer as the citation gives it.`
    );
  }
  return found;
}

export function actOf(id: string): ActName {
  const act = (acts.acts as ActName[]).find((each) => each.id === id);
  if (!act) throw new Error(`${id} is not in legal-acts.json.`);
  return act;
}

const superscriptCharacter = new RegExp(`[${superscriptDigits}]`, 'u');
const superscriptRun =
  /<w:r(?=[\s>])[^>]*>(?:(?!<\/w:r>)[\s\S])*?<w:vertAlign w:val="superscript"\/>(?:(?!<\/w:r>)[\s\S])*?<w:t(?: [^>]*)?>\d+<\/w:t>/;

function superscriptStyle(paragraphs: Paragraph[], quote: Paragraph[]): SuperscriptStyle {
  const xml = quote.map((paragraph) => paragraph.xml).join('');
  if (superscriptRun.test(xml)) return 'runs';
  if (quote.some((paragraph) => superscriptCharacter.test(paragraph.text))) return 'characters';
  const all = paragraphs.map((paragraph) => paragraph.xml).join('');
  const runs = all.match(new RegExp(superscriptRun.source, 'g'))?.length ?? 0;
  const characters = paragraphs.filter((paragraph) =>
    superscriptCharacter.test(paragraph.text)
  ).length;
  return runs > characters ? 'runs' : 'characters';
}

const labelPattern = new RegExp(
  `^(?:\\((\\d+[${superscriptDigits}]*)\\)|([a-z][${superscriptDigits}]*)\\))`,
  'u'
);
export const labelOf = (line: string) => {
  const match = labelPattern.exec(line);
  return match ? (match[1] ?? match[2]!) : null;
};
const fold = (line: string) => line.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

function similarity(a: string, b: string) {
  const words = (line: string) => new Set(tokenize(fold(line)).filter((t) => /\p{L}/u.test(t)));
  const left = words(a);
  const right = words(b);
  const shared = [...left].filter((word) => right.has(word)).length;
  return shared / Math.max(1, new Set([...left, ...right]).size);
}

/**
 * Which new line takes the place of which old one: by the alineat or letter they open with,
 * or else by the words they share. Unpaired lines are added or removed.
 */
function pairLines(before: string[], after: string[], firstFixed: boolean) {
  const score = (i: number, j: number) => {
    if (firstFixed && (i === 0) !== (j === 0)) return null;
    const a = labelOf(before[i]!);
    const b = labelOf(after[j]!);
    const value = similarity(before[i]!, after[j]!);
    if (firstFixed && i === 0) return (a && a === b ? 2 : 0) + value;
    if (a && b) return a === b ? 2 + value : null;
    return value >= 0.3 ? value : null;
  };
  const width = after.length + 1;
  const best = new Float64Array((before.length + 1) * width);
  for (let i = before.length - 1; i >= 0; i -= 1) {
    for (let j = after.length - 1; j >= 0; j -= 1) {
      const pair = score(i, j);
      best[i * width + j] = Math.max(
        best[(i + 1) * width + j]!,
        best[i * width + j + 1]!,
        pair === null ? -Infinity : pair + best[(i + 1) * width + j + 1]!
      );
    }
  }
  const pairs = new Map<number, number>();
  let i = 0;
  let j = 0;
  while (i < before.length && j < after.length) {
    const pair = score(i, j);
    if (pair !== null && best[i * width + j] === pair + best[(i + 1) * width + j + 1]!) {
      pairs.set(i, j);
      i += 1;
      j += 1;
    } else if (best[i * width + j] === best[(i + 1) * width + j]) i += 1;
    else j += 1;
  }
  return pairs;
}

const edges = (text: string) => ({
  leading: /^\s*/.exec(text)![0],
  trailing: /\s*$/.exec(text)![0],
});

// A copy must not carry the bookmark or the paragraph ids of the paragraph it was cloned from:
// two paragraphs with one id make Word repair the file.
const cloneable = (xml: string) =>
  xml
    .replace(/<w:bookmark(?:Start|End)\b[^>]*\/>/g, '')
    .replace(/ w14:(?:paraId|textId)="[^"]*"/g, '');

interface PlannedChange extends LineChange {
  /** The marker's paragraph is 0; an added line sits after `offset`, `nth` among the added. */
  offset: number;
  nth?: number;
}

export interface Passage {
  quote: Citation;
  act: ActName;
  quoted: Paragraph[];
  /** The marker as the paragraph spells it. */
  marker: string;
  /** The quote's lines and the paragraph of each, 0 being the marker's. */
  owners: { offset: number; line: string }[];
  superscripts: SuperscriptStyle;
}

export function readPassage(source: Uint8Array, citation: QuotedCitation): Passage {
  const quote = findQuote(source, citation);
  const paragraphs = paragraphsOf(documentXml(source));
  const quoted = paragraphs.slice(quote.paragraph, quote.lastParagraph + 1);
  const { length } = parseMarker(quoted[0]!.text)!;
  const firstLine = quoted[0]!.text.slice(length).trim();
  return {
    quote,
    act: actOf(quote.act),
    quoted,
    marker: quoted[0]!.text.slice(0, length),
    owners: quoted.flatMap((paragraph, offset) =>
      offset === 0 && !firstLine
        ? []
        : [{ offset, line: offset === 0 ? firstLine : paragraph.text.trim() }]
    ),
    superscripts: superscriptStyle(paragraphs, quoted),
  };
}

/**
 * The passage after the change, line by line: a line of the template carries its paragraph,
 * `after` null when it is removed; an added line has no paragraph.
 */
export interface PassageLine {
  offset: number | null;
  before: string | null;
  after: string | null;
}

export function planPassage(
  passage: Passage,
  lines: PassageLine[],
  locator: string,
  notes: string[]
) {
  const { quote, quoted, marker } = passage;
  const plan: QuotePlan = {
    paragraphs: quoted.map(() => ({ inserted: [] })),
    superscripts: passage.superscripts,
  };
  let markerText = marker;
  if (locator !== quote.locator) {
    const span = markerLocatorSpan(marker)!;
    markerText = marker.slice(0, span.start) + locator + marker.slice(span.end);
    if (parseMarker(markerText)?.locator !== locator) {
      throw new Error(`"${locator}" is not a locator a marker can carry.`);
    }
    plan.paragraphs[0]!.text = markerText + quoted[0]!.text.slice(marker.length);
  }
  const paragraphText = (offset: number, line: string) => {
    const original = offset === 0 ? quoted[0]!.text.slice(marker.length) : quoted[offset]!.text;
    const { leading, trailing } = edges(original);
    return `${offset === 0 ? markerText : ''}${leading || (offset === 0 ? ' ' : '')}${line}${trailing}`;
  };

  const changes: PlannedChange[] = [];
  let anchor = 0;
  for (const line of lines) {
    if (line.offset === null) {
      const step = plan.paragraphs[anchor]!;
      changes.push({
        kind: 'added',
        paragraph: -1,
        before: null,
        after: line.after,
        offset: anchor,
        nth: step.inserted.length,
      });
      step.inserted.push(line.after!);
      continue;
    }
    anchor = line.offset;
    if (line.after === null) {
      if (line.offset === 0) throw new Error('The marker paragraph cannot lose its line.');
      plan.paragraphs[line.offset]!.text = null;
      changes.push({
        kind: 'removed',
        paragraph: quote.paragraph + line.offset,
        before: line.before,
        after: null,
        offset: line.offset,
      });
    } else if (line.after !== line.before) {
      plan.paragraphs[line.offset]!.text = paragraphText(line.offset, line.after);
      changes.push({ kind: 'changed', paragraph: -1, ...line, offset: line.offset });
    }
  }

  const position: number[] = [];
  let at = quote.paragraph;
  plan.paragraphs.forEach((step, offset) => {
    position[offset] = at;
    if (step.text !== null) at += 1;
    at += step.inserted.length;
  });
  const summary: QuoteReplacementSummary = {
    file: quote.file,
    act: passage.act.name,
    locator,
    changes: changes.map(({ offset, nth, ...change }) => ({
      ...change,
      paragraph:
        change.kind === 'removed'
          ? change.paragraph
          : position[offset]! +
            (nth === undefined ? 0 : (plan.paragraphs[offset]!.text === null ? 0 : 1) + nth),
    })),
    notes: locator === quote.locator ? notes : [`the marker now cites ${locator}`, ...notes],
  };
  const text = lines.flatMap((line) => (line.after === null ? [] : [line.after])).join('\n');
  return { plan, quote, summary, text };
}

export function planQuoteReplacement(
  source: Uint8Array,
  replacement: QuoteReplacement,
  options: QuoteReplacementOptions = {}
) {
  const passage = readPassage(source, replacement.citation);
  const { owners, act } = passage;
  const lines = replacement.lines.map((line) => line.trim()).filter(Boolean);
  if (!lines.length) throw new Error('The new wording has no lines.');
  const pairs = pairLines(
    owners.map((owner) => owner.line),
    lines.map(normalizeIncoming),
    owners[0]?.offset === 0
  );
  const ownerOf = new Map([...pairs].map(([owner, line]) => [line, owner]));

  const notes: string[] = [];
  const conformed = lines.map((line, index) => {
    const owner = ownerOf.get(index);
    const wording = conformLine(line, owner === undefined ? null : owners[owner]!.line, {
      act,
      dictionary: options.dictionary,
    });
    const label = labelOf(wording.text);
    for (const note of wording.notes) notes.push(label ? `(${label}) ${note}` : note);
    return wording.text;
  });

  const passageLines: PassageLine[] = [];
  let next = 0;
  const addUntil = (until: number) => {
    for (; next < until; next += 1) {
      passageLines.push({ offset: null, before: null, after: conformed[next]! });
    }
  };
  owners.forEach((owner, index) => {
    const line = pairs.get(index);
    if (line !== undefined) {
      addUntil(line);
      next = line + 1;
    }
    passageLines.push({
      offset: owner.offset,
      before: owner.line,
      after: line === undefined ? null : conformed[line]!,
    });
  });
  addUntil(lines.length);
  return planPassage(passage, passageLines, replacement.locator ?? passage.quote.locator!, notes);
}

export function applyQuotePlan(source: Uint8Array, first: number, plan: QuotePlan) {
  const xml = documentXml(source);
  const quoted = paragraphsOf(xml).slice(first, first + plan.paragraphs.length);
  const cloneFrom = (offset: number) => {
    const neighbour = [...quoted.slice(1, offset + 1).reverse(), ...quoted.slice(offset + 1)][0];
    return neighbour
      ? cloneable(neighbour.xml)
      : cloneable(quoted[0]!.xml).replace(/<w:numPr>[\s\S]*?<\/w:numPr>/, '');
  };
  let rewritten = '';
  let last = 0;
  plan.paragraphs.forEach((step, offset) => {
    const paragraph = quoted[offset]!;
    rewritten += xml.slice(last, paragraph.offset);
    if (step.text === undefined) rewritten += paragraph.xml;
    else if (step.text !== null) {
      rewritten += rewriteParagraph(paragraph.xml, step.text, plan.superscripts);
    }
    for (const line of step.inserted) {
      rewritten += rewriteParagraph(cloneFrom(offset), line, plan.superscripts);
    }
    last = paragraph.offset + paragraph.xml.length;
  });
  rewritten += xml.slice(last);
  return withDocumentXml(source, rewritten);
}

/**
 * Applies a plan and checks that the citation parser reads `text` back: a line that does not
 * read as part of a quote would end it early.
 */
export function applyPassage(
  source: Uint8Array,
  { plan, quote, summary, text }: ReturnType<typeof planPassage>
) {
  if (!summary.changes.length && summary.locator === quote.locator) {
    return { source, plan, quote, summary };
  }
  const result = applyQuotePlan(source, quote.paragraph, plan);
  const reread = quotesOf(result, quote.file).find(
    (each) => each.paragraph === quote.paragraph && each.act === quote.act
  );
  if (!reread || reread.locator !== summary.locator || reread.text !== text) {
    throw new Error(
      `${quote.file}: after the change the parser reads ${reread ? `${reread.locator}: "${reread.text}"` : 'no quote'} where it should read ${summary.locator}: "${text}".`
    );
  }
  return { source: result, plan, quote: reread, summary };
}

/** Replaces a quoted passage with its current wording, in the template's spelling and formatting. */
export function replaceQuote(
  source: Uint8Array,
  replacement: QuoteReplacement,
  options: QuoteReplacementOptions = {}
) {
  return applyPassage(source, planQuoteReplacement(source, replacement, options));
}

const quoteLabel = (line: string) => {
  const label = labelOf(line);
  return label ? (/^\d/.test(label) ? `alin. (${label})` : `lit. ${label})`) : 'text';
};

export function summaryMarkdown(summary: QuoteReplacementSummary) {
  const lines = [`**${summary.file}**: ${summary.act}, ${summary.locator}`, ''];
  for (const change of summary.changes) {
    const label = quoteLabel(change.after ?? change.before!);
    if (change.kind === 'changed') {
      lines.push(`- ${label}, ¶${change.paragraph}: ${inlineDiff(change.before!, change.after!)}`);
    } else if (change.kind === 'added') {
      lines.push(`- ${label} added, ¶${change.paragraph}: ${change.after}`);
    } else {
      lines.push(`- ${label} removed, was ¶${change.paragraph}: ~~${change.before}~~`);
    }
  }
  if (!summary.changes.length) lines.push('- no wording changed');
  if (summary.notes.length) {
    lines.push('', 'To check:', ...summary.notes.map((note) => `- ${note}`));
  }
  return lines.join('\n');
}

export function inlineDiff(before: string, after: string) {
  let text = '';
  let deleted = '';
  let inserted = '';
  const flush = () => {
    const changed = deleted || inserted;
    if (!changed.trim()) {
      text += inserted;
    } else {
      const marked = [
        deleted.trim() ? `~~${deleted.trim()}~~` : '',
        inserted.trim() ? `**${inserted.trim()}**` : '',
      ];
      text += `${/^\s/.test(changed) ? ' ' : ''}${marked.filter(Boolean).join(' ')}${/\s$/.test(changed) ? ' ' : ''}`;
    }
    deleted = '';
    inserted = '';
  };
  for (const op of diff(tokenize(before), tokenize(after))) {
    if (op.kind === 'equal') {
      flush();
      text += op.before;
    } else if (op.kind === 'delete') deleted += op.before;
    else inserted += op.after;
  }
  flush();
  return text;
}
