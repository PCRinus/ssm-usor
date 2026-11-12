import { type ActUnit, plainLabel } from './act-text';

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

export const children = (unit: ActUnit, kind: ActUnit['kind']) =>
  unit.content.filter((item): item is ActUnit => typeof item !== 'string' && item.kind === kind);

export function selectAlineate(article: ActUnit, wanted: Locator['alineate']) {
  const alineate = children(article, 'alineat');
  if (!wanted.range) {
    return wanted.list.map((label) => alineate.find((unit) => plainLabel(unit.label) === label));
  }
  const first = alineate.findIndex((unit) => plainLabel(unit.label) === wanted.list[0]);
  const last = alineate.findIndex((unit) => plainLabel(unit.label) === wanted.list.at(-1));
  if (first < 0 || last < first) return [undefined];
  return alineate.slice(first, last + 1);
}

export function findPoint(unit: ActUnit, label: string): ActUnit | null {
  for (const item of unit.content) {
    if (typeof item === 'string') continue;
    if (item.kind === 'point' && plainLabel(item.label) === label) return item;
    const found = findPoint(item, label);
    if (found) return found;
  }
  return null;
}
