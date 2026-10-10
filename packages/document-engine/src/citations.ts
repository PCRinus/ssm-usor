import PizZip from 'pizzip';

import { type Paragraph, paragraphsOf } from './text';

export type TemplateSet = 'ssm' | 'fire' | 'other';
export type ActKind = 'lege' | 'hg' | 'oug' | 'og' | 'ordin' | 'omai';
export type CitationForm = 'quote' | 'reference';

export interface ActName {
  id: string;
  kind: ActKind;
  number: string;
  year: number;
  name: string;
}

export interface Citation {
  manifest: TemplateSet;
  file: string;
  typeKey: string;
  /** Index among every `<w:p>` of `word/document.xml`, empty ones included. */
  paragraph: number;
  /** The last paragraph a quoted article spans; the paragraph itself for a reference. */
  lastParagraph: number;
  /** The innermost section the citation sits in, `#name` or `^name`, null outside any. */
  block: string | null;
  form: CitationForm;
  act: string;
  article: string | null;
  /** "Art. 7 alin. (1)" or "Anexa 2" for a quoted article; null for a reference. */
  locator: string | null;
  /** The quoted words, one line per paragraph; null for a reference. */
  text: string | null;
}

export interface TemplateSource {
  manifest: TemplateSet;
  file: string;
  typeKey: string;
  source: Uint8Array;
}

const kinds: Record<string, ActKind> = {
  Legea: 'lege',
  Legii: 'lege',
  'H.G.': 'hg',
  'O.U.G.': 'oug',
  'O.G.': 'og',
  Ordinul: 'ordin',
  Ordinului: 'ordin',
  OMAI: 'omai',
};

const prefixes: Record<ActKind, string> = {
  lege: 'Legea',
  hg: 'H.G.',
  oug: 'O.U.G.',
  og: 'O.G.',
  ordin: 'Ordinul',
  omai: 'OMAI',
};

const actBody = String.raw`(?:Legea|Legii|H\.G\.|O\.U\.G\.|O\.G\.|Ordinul|Ordinului|OMAI) \d+(?:\/\d+)?\/\d{4}`;
const actMention = new RegExp(String.raw`(?<![\p{L}\d.])${actBody}(?!\d)`, 'gu');

const superscripts = '¹²³⁴⁵⁶⁷⁸⁹⁰';
const articleNumber = String.raw`(?:\d+[${superscripts}]*|[IVXLC]+)`;
const alineat = String.raw`\(\d+[${superscripts}]*\)`;
const letter = String.raw`[a-z][${superscripts}]*\)`;
const articleLocator =
  String.raw`[Aa]rt\. (?<article>${articleNumber})(?:, ${articleNumber})*` +
  String.raw`(?: alin\. ${alineat}(?:(?:, | și | – |–)${alineat})*)?` +
  String.raw`(?: lit\. ${letter}(?:(?:, | și )${letter})*)?` +
  String.raw`(?:, pct\. \d+)?`;
const marker = new RegExp(
  String.raw`^\(Preluare din (?<act>${actBody}) – (?<locator>${articleLocator}|Anexa \d+|pct\. \d+)` +
    String.raw`(?: – conf\. ${actBody}(?: – pct\. \d+)?)?\)`,
  'u'
);

export const markerPrefix = '(Preluare din';

const sectionTag = /\{\{([#^/])([^{}]+?)\}\}/g;
const opensLikeArticle = new RegExp(String.raw`^(?:${alineat}|Art\.)`, 'u');
const opensLikeQuoteLine = new RegExp(String.raw`^(?:${alineat}|${letter})`, 'u');
const heading = /^(?:Capitolul|CAPITOLUL|Subcapitolul|Secțiunea|SECȚIUNEA)\b/;

export function parseAct(mention: string): ActName | null {
  const match = /^(\S+) (\d+(?:\/\d+)?)\/(\d{4})$/.exec(mention);
  const kind = match ? kinds[match[1]!] : undefined;
  if (!match || !kind) return null;
  const number = match[2]!;
  const year = Number(match[3]);
  return {
    id: `${kind}-${number.replace('/', '-')}-${year}`,
    kind,
    number,
    year,
    name: `${prefixes[kind]} ${number}/${year}`,
  };
}

export interface Marker {
  act: ActName;
  article: string | null;
  locator: string;
  length: number;
}

// The index names an article one way, whatever case and range dash its marker is written with.
const canonicalLocator = (locator: string) =>
  locator.replace(/^art\./, 'Art.').replace(/\)–\(/g, ') – (');

export function parseMarker(text: string): Marker | null {
  const match = marker.exec(text);
  if (!match) return null;
  return {
    act: parseAct(match.groups!.act!)!,
    article: match.groups!.article ?? null,
    locator: canonicalLocator(match.groups!.locator!),
    length: match[0].length,
  };
}

export function readsLikeArticle(text: string) {
  return opensLikeArticle.test(text.trimStart());
}

interface Numbering {
  numId: string;
  level: string;
}

function numberingOf(xml: string): Numbering | null {
  const properties = /<w:pPr>[\s\S]*?<\/w:pPr>/.exec(xml)?.[0] ?? '';
  const numId = /<w:numId w:val="(\d+)"\/>/.exec(properties)?.[1];
  if (!numId || numId === '0') return null;
  return { numId, level: /<w:ilvl w:val="(\d+)"\/>/.exec(properties)?.[1] ?? '0' };
}

function continuesQuote(
  paragraph: Paragraph,
  previous: Paragraph,
  start: Paragraph,
  inTable: (paragraph: Paragraph) => boolean
) {
  const text = paragraph.text.trim();
  if (!text || text.startsWith(markerPrefix) || heading.test(text)) return false;
  if (inTable(paragraph) && !inTable(start)) return false;
  const own = numberingOf(start.xml);
  const numbering = numberingOf(paragraph.xml);
  if (own && own.level === '0' && numbering?.numId === own.numId && numbering.level === '0') {
    return false;
  }
  return opensLikeQuoteLine.test(text) || /(?::|;|; (?:sau|și))$/.test(previous.text.trim());
}

function articleAround(text: string, start: number, end: number, from: number) {
  const after = new RegExp(String.raw`^ – [Aa]rt\. (${articleNumber})`, 'u').exec(text.slice(end));
  if (after) return after[1]!;
  const before = text.slice(Math.max(from, start - 80), start);
  const articles = [
    ...before.matchAll(new RegExp(String.raw`\b[Aa]rt\. (${articleNumber})`, 'gu')),
  ];
  const last = articles.at(-1);
  if (!last) return null;
  const between = before.slice(last.index + last[0].length);
  return /^[^;]*\sdin\s$/.test(between) ? last[1]! : null;
}

class Sections {
  private stack: string[] = [];

  at(text: string, offset: number) {
    const stack = [...this.stack];
    for (const tag of text.matchAll(sectionTag)) {
      if (tag.index >= offset) break;
      Sections.apply(stack, tag);
    }
    return stack.at(-1) ?? null;
  }

  pass(text: string) {
    for (const tag of text.matchAll(sectionTag)) Sections.apply(this.stack, tag);
  }

  private static apply(stack: string[], tag: RegExpMatchArray) {
    if (tag[1] === '/') stack.pop();
    else stack.push(`${tag[1]}${tag[2]!.trim()}`);
  }
}

export function templateCitations(template: TemplateSource): Citation[] {
  const xml = new PizZip(template.source).file('word/document.xml')?.asText() ?? '';
  const paragraphs = paragraphsOf(xml);
  const tables = [...xml.matchAll(/<w:tbl>[\s\S]*?<\/w:tbl>/g)].map((table) => [
    table.index,
    table.index + table[0].length,
  ]);
  const inTable = (paragraph: Paragraph) =>
    tables.some(([start, end]) => paragraph.offset > start! && paragraph.offset < end!);
  const sections = new Sections();
  const citations: Citation[] = [];
  const base = { manifest: template.manifest, file: template.file, typeKey: template.typeKey };

  paragraphs.forEach((paragraph, index) => {
    const { text } = paragraph;
    const quoted = parseMarker(text);
    if (quoted) {
      const lines = [text.slice(quoted.length).trim()];
      let last = index;
      while (
        last + 1 < paragraphs.length &&
        continuesQuote(paragraphs[last + 1]!, paragraphs[last]!, paragraph, inTable)
      ) {
        last += 1;
        lines.push(paragraphs[last]!.text.trim());
      }
      citations.push({
        ...base,
        paragraph: index,
        lastParagraph: last,
        block: sections.at(text, 0),
        form: 'quote',
        act: quoted.act.id,
        article: quoted.article,
        locator: quoted.locator,
        text: lines.filter(Boolean).join('\n'),
      });
    }

    const seen = new Set<string>();
    let previousEnd = 0;
    for (const mention of text.matchAll(actMention)) {
      const start = mention.index;
      const end = start + mention[0].length;
      const from = previousEnd;
      previousEnd = end;
      if (quoted && start === markerPrefix.length + 1) continue;
      const act = parseAct(mention[0])!;
      const article = articleAround(text, start, end, from);
      const key = `${act.id} ${article}`;
      if (seen.has(key)) continue;
      seen.add(key);
      citations.push({
        ...base,
        paragraph: index,
        lastParagraph: index,
        block: sections.at(text, start),
        form: 'reference',
        act: act.id,
        article,
        locator: null,
        text: null,
      });
    }
    sections.pass(text);
  });
  return citations;
}
