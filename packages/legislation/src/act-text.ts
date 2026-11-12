import { type AmendmentNote, noteStart, parseNote, type UnitPath } from './amendments';
import {
  decodeEntities,
  pause,
  PortalError,
  type PortalOptions,
  portalOrigin,
  portalPauseMs,
  request,
} from './portal';

export type UnitKind =
  | 'part'
  | 'title'
  | 'chapter'
  | 'section'
  | 'paragraph'
  | 'block'
  | 'article'
  | 'alineat'
  | 'letter'
  | 'point'
  | 'annex';

export type ActUnit = {
  kind: UnitKind;
  // "36", "109^2", "1^1", "a", "5": the number as the portal writes it, without its dressing.
  label: string;
  heading: string | null;
  content: (string | ActUnit)[];
  notes: AmendmentNote[];
};

export type ActText = {
  title: string;
  content: (string | ActUnit)[];
  notes: AmendmentNote[];
  // Annexes the portal keeps as documents of their own, linked from the unit that holds them.
  references: { portalId: number; unit: ActUnit | null }[];
};

const unitClasses: Record<string, UnitKind> = {
  S_PRT: 'part',
  S_TTL: 'title',
  S_CAP: 'chapter',
  S_SEC: 'section',
  S_PRG: 'paragraph',
  S_BLC: 'block',
  S_ART: 'article',
  S_ALN: 'alineat',
  S_LIT: 'letter',
  S_PCT: 'point',
  S_ANX: 'annex',
};

const skippedClasses = new Set([
  'TAG_COLLAPSED',
  'S_NTA',
  'S_REF',
  'S_DEN',
  'S_HDR',
  'S_EMT',
  'S_PUB',
  'S_EMT_TTL',
  'S_EMT_BDY',
  'S_PRE',
]);

const inlineLabels: Partial<Record<UnitKind, RegExp>> = {
  alineat: /^\((\d+(?:\^\d+)?)\)\s*/,
  letter: /^([a-z](?:\^\d+)?)\)\s*/,
  point: /^(\d+(?:\^\d+)?)\.\s*/,
};

// Some consolidated forms write an amendment as a paragraph of its own, without the date it took
// effect: "Art. 2 a fost modificat de pct. 1 al art. I din HOTĂRÂREA nr. 359 din 20 mai 2015 …".
const undatedNote =
  /^(?:Art\.|Articolul|Alin\.|Alineatul|Lit\.|Litera|Pct\.|Punctul|Anexa|Partea|Titlul|Capitolul|Sec[țţ]iunea|Paragraful|Textul|Denumirea)[\s\S]*? a fost \p{L}+ (?:de|prin)\b[\s\S]*MONITORUL OFICIAL/u;

type Element = {
  className: string | null;
  hidden: boolean;
  children: (Element | string)[];
  links: number[];
};

const lineBreakTags = new Set(['br', 'p', 'div', 'li', 'tr', 'table', 'ul', 'ol']);

// Only spans nest reliably on the portal's pages; every other tag is read as a break or dropped.
function spanTree(html: string): Element {
  const root: Element = { className: null, hidden: false, children: [], links: [] };
  const stack = [root];
  const tokens = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][\w:-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>|([^<]+)|</g;
  for (const token of html.matchAll(tokens)) {
    const current = stack.at(-1)!;
    if (token[4] !== undefined) {
      current.children.push(decodeEntities(token[4]));
      continue;
    }
    const tag = token[2]?.toLowerCase();
    if (!tag) continue;
    const closing = token[1] === '/';
    const attributes = token[3] ?? '';
    if (tag === 'span') {
      if (closing) {
        if (stack.length > 1) stack.pop();
        continue;
      }
      const element: Element = {
        className: /\bclass=["']?([\w-]+)/.exec(attributes)?.[1] ?? null,
        hidden: /display:\s*none/.test(attributes),
        children: [],
        links: [],
      };
      current.children.push(element);
      if (!/\/\s*$/.test(attributes)) stack.push(element);
      continue;
    }
    if (tag === 'a' && !closing) {
      const link = /DetaliiDocument(?:Afis)?\/(\d+)/.exec(attributes);
      if (link) current.links.push(Number(link[1]));
    }
    if (lineBreakTags.has(tag)) current.children.push('\n');
    else if (tag === 'td' || tag === 'th') current.children.push(' ');
  }
  return root;
}

function plainText(element: Element): string {
  return element.children
    .map((child) =>
      typeof child === 'string'
        ? child
        : child.hidden || skippedClasses.has(child.className ?? '')
          ? ''
          : plainText(child)
    )
    .join('');
}

function linksOf(element: Element): number[] {
  return [
    ...element.links,
    ...element.children.flatMap((child) => (typeof child === 'string' ? [] : linksOf(child))),
  ];
}

const tidy = (value: string) => value.replace(/\s+/g, ' ').trim();

function unitLabel(kind: UnitKind, title: string) {
  const text = tidy(title);
  switch (kind) {
    case 'article':
      return text.replace(/^(?:Articolul|ARTICOLUL|Art\.?|ART\.?)\s*/, '').replace(/\.$/, '');
    case 'alineat':
      return text.replace(/^\(/, '').replace(/\)$/, '');
    case 'letter':
      return text.replace(/\)$/, '');
    case 'point':
      return text.replace(/\.$/, '');
    case 'annex':
      return (
        /(\d+[A-Z]?)\s*$/.exec(text)?.[1] ??
        text.replace(/^(?:Anexa|ANEXA)\s*(?:nr\.|Nr\.)?\s*/, '')
      );
    default:
      return text;
  }
}

class Reader {
  readonly notes: AmendmentNote[] = [];
  readonly references: ActText['references'] = [];
  private readonly stack: ActUnit[] = [];

  path(): UnitPath {
    const path: UnitPath = { annex: null, article: null, alineat: null, letter: null, point: null };
    for (const unit of this.stack) {
      if (unit.kind === 'annex') path.annex = unit.label;
      if (unit.kind === 'article') path.article = unit.label;
      if (unit.kind === 'alineat') path.alineat = unit.label;
      if (unit.kind === 'letter') path.letter = unit.label;
      if (unit.kind === 'point') path.point = unit.label;
    }
    return path;
  }

  unit(kind: UnitKind, element: Element): ActUnit {
    const prefix = element.className!;
    const unit: ActUnit = { kind, label: '', heading: null, content: [], notes: [] };
    this.stack.push(unit);
    for (const child of element.children) {
      if (typeof child === 'string' || child.hidden) continue;
      if (child.className === `${prefix}_TTL`) unit.label = unitLabel(kind, plainText(child));
      else if (child.className === `${prefix}_DEN`) unit.heading = tidy(plainText(child)) || null;
      else if (child.className === `${prefix}_BDY`) this.body(child, unit.content);
    }
    this.stack.pop();
    const [first] = unit.content;
    // Older forms leave the title empty and start the body with the label, and mark an alineat
    // "(1)" as a letter.
    if (!unit.label && kind in inlineLabels && typeof first === 'string') {
      for (const [inlineKind, pattern] of Object.entries(inlineLabels)) {
        const label = pattern.exec(first);
        if (!label) continue;
        unit.kind = inlineKind as UnitKind;
        unit.label = label[1]!;
        unit.content[0] = first.slice(label[0].length);
        break;
      }
    }
    return unit;
  }

  body(element: Element, content: (string | ActUnit)[]) {
    let line = '';
    const flush = () => {
      const text = tidy(line);
      if (text && !/^-{3,}$/.test(text)) content.push(text);
      line = '';
    };
    const walk = (node: Element) => {
      for (const child of node.children) {
        if (typeof child === 'string') {
          if (child.includes('\n')) {
            const [first, ...rest] = child.split('\n');
            line += first;
            for (const part of rest) {
              flush();
              line += part;
            }
          } else line += child;
          continue;
        }
        if (child.className === 'S_REF') {
          const [portalId] = linksOf(child);
          if (portalId !== undefined)
            this.references.push({ portalId, unit: this.stack.at(-1) ?? null });
          continue;
        }
        if (child.hidden || skippedClasses.has(child.className ?? '')) continue;
        if (child.className?.endsWith('_SHORT')) continue;
        const kind = unitClasses[child.className ?? ''];
        if (kind) {
          flush();
          content.push(this.unit(kind, child));
          continue;
        }
        if (child.className === 'S_PAR' || child.className === 'A_PAR') {
          const text = tidy(plainText(child));
          if (noteStart.test(text) || undatedNote.test(text)) {
            const links = linksOf(child);
            const note = parseNote(text, this.path(), links[0] ?? null);
            if (note) {
              this.notes.push(note);
              this.stack.at(-1)?.notes.push(note);
            }
            continue;
          }
          // The editor's footnotes, "*) A se vedea …", are not part of the act.
          if (/^\*+\)/.test(text)) continue;
          flush();
          walk(child);
          flush();
          continue;
        }
        walk(child);
      }
    };
    walk(element);
    flush();
  }
}

function headingText(element: Element): string {
  return element.children
    .map((child) =>
      typeof child === 'string'
        ? ` ${child} `
        : child.hidden || /^(?:TAG_COLLAPSED|S_EMT|S_PUB)/.test(child.className ?? '')
          ? ''
          : headingText(child)
    )
    .join('');
}

export function hasActText(html: string) {
  return /class="S_(?:ART|ANX|ALN|PCT)"/.test(html);
}

export function parseActText(html: string, portalId: number): ActText {
  const start = html.indexOf('<span class="S_DEN"');
  if (start < 0) throw new PortalError(`Page ${portalId} has no act heading (S_DEN).`);
  // The act's heading, its issuer and its gazette come before the hidden "fișă act" lists, the
  // text after them.
  const lists = html.indexOf('id="fisaact"', start);
  const split = lists < 0 ? start : html.lastIndexOf('<span', lists);
  const title = tidy(headingText(spanTree(html.slice(start, split))));
  const root = spanTree(html.slice(split));
  const reader = new Reader();
  const content: (string | ActUnit)[] = [];
  reader.body(root, content);
  return {
    title,
    content,
    notes: reader.notes,
    references: reader.references,
  };
}

// A page too large for the portal to show inline, the Criminal Code's, links its text from the
// act's heading or from a reference where the text would be.
export function textLink(html: string): number | null {
  const reference = /class="S_REF"[^>]*>\s*<a[^>]*DetaliiDocumentAfis\/(\d+)/i.exec(html);
  if (reference) return Number(reference[1]);
  const heading = /class="S_HDR"[^>]*>[^<]*<a[^>]*DetaliiDocumentAfis\/(\d+)/i.exec(html);
  return heading ? Number(heading[1]) : null;
}

export type ConsolidatedForm = {
  date: string;
  // A republication may renumber the act; a consolidation never does.
  kind: 'consolidation' | 'republication';
  // The page of that form, with the query a republication's link carries; null for the page the
  // list was read from.
  path: string | null;
};

export function parseConsolidations(html: string): ConsolidatedForm[] {
  const forms = [
    ...html.matchAll(
      /<a title='(Consolidarea|Republicarea) din (\d{2})\.(\d{2})\.(\d{4})'([^>]*)>/g
    ),
  ].map((match): ConsolidatedForm => {
    const link = /href='[^']*?(\/Public\/DetaliiDocument\/\d+[^']*)'/.exec(match[5]!);
    return {
      date: `${match[4]}-${match[3]}-${match[2]}`,
      kind: match[1] === 'Consolidarea' ? 'consolidation' : 'republication',
      path: link ? link[1]! : null,
    };
  });
  return forms.sort((a, b) => b.date.localeCompare(a.date));
}

export function formOn(forms: ConsolidatedForm[], date: string) {
  return forms.find((form) => form.date <= date) ?? null;
}

export type FetchedActText = {
  portalId: number;
  // The page of the form read, the act's own for its newest form.
  formPortalId: number;
  // Null for an act never consolidated, read as published.
  consolidatedOn: string | null;
  source: 'page' | 'afis';
  url: string;
  annexUrls: string[];
  text: ActText;
};

// "CERINŢE MINIME din 26 iulie 2006 (*actualizate*) privind gesturile-semnal (actualizate la data
// de 1 iunie 2015*)" is the annex's title, "CERINŢE MINIME privind gesturile-semnal".
const annexHeading = (title: string) =>
  tidy(
    title
      .replace(/\(\*?actualizat[ăe]?\b[^)]*\)\*?/giu, ' ')
      .replace(/\s+din \d{1,2} \p{L}+ \d{4}/u, ' ')
  ) || null;

async function readAnnexes(text: ActText, origin: string, options: PortalOptions) {
  const urls: string[] = [];
  for (const reference of text.references) {
    const holder = reference.unit;
    if (holder?.kind !== 'annex') continue;
    await pause(options.pauseMs ?? portalPauseMs);
    const url = new URL(`/Public/DetaliiDocumentAfis/${reference.portalId}`, origin).href;
    const annex = parseActText(await (await request(url, {}, options)).text(), reference.portalId);
    holder.heading ??= annexHeading(annex.title);
    holder.content.push(...annex.content);
    for (const note of annex.notes) {
      note.path.annex ??= holder.label;
      text.notes.push(note);
    }
    urls.push(url);
  }
  return urls;
}

async function readText(page: string, pageUrl: string, pageId: number, options: PortalOptions) {
  const origin = options.origin ?? portalOrigin;
  if (hasActText(page)) {
    const text = parseActText(page, pageId);
    const annexUrls = await readAnnexes(text, origin, options);
    return { source: 'page' as const, url: pageUrl, annexUrls, text };
  }
  const afisId = textLink(page);
  if (afisId === null) {
    throw new PortalError(`Page ${pageId} holds no articles and links no text to read them from.`);
  }
  await pause(options.pauseMs ?? portalPauseMs);
  const afisUrl = new URL(`/Public/DetaliiDocumentAfis/${afisId}`, origin).href;
  const afis = await (await request(afisUrl, {}, options)).text();
  if (!hasActText(afis)) {
    throw new PortalError(`The text ${afisId} of page ${pageId} holds no articles.`);
  }
  const text = parseActText(afis, afisId);
  const annexUrls = await readAnnexes(text, origin, options);
  return { source: 'afis' as const, url: afisUrl, annexUrls, text };
}

// Every form's page lists the act's other forms, each with a page of its own, so the act's page is
// read first even for an earlier form.
export async function fetchActForm(
  portalId: number,
  on: string | null,
  options: PortalOptions = {}
): Promise<FetchedActText> {
  const origin = options.origin ?? portalOrigin;
  const pageUrl = new URL(`/Public/DetaliiDocument/${portalId}`, origin).href;
  const page = await (await request(pageUrl, {}, options)).text();
  const forms = parseConsolidations(page);
  const form = on === null ? (forms[0] ?? null) : formOn(forms, on);
  if (on !== null && !form && forms.length > 0) {
    throw new PortalError(`Act ${portalId} has no consolidated form on or before ${on}.`);
  }
  if (!form?.path) {
    return {
      portalId,
      formPortalId: portalId,
      consolidatedOn: form?.date ?? null,
      ...(await readText(page, pageUrl, portalId, options)),
    };
  }
  await pause(options.pauseMs ?? portalPauseMs);
  const formUrl = new URL(form.path, origin).href;
  const formId = Number(/DetaliiDocument\/(\d+)/.exec(form.path)![1]);
  const formPage = await (await request(formUrl, {}, options)).text();
  return {
    portalId,
    formPortalId: formId,
    consolidatedOn: form.date,
    ...(await readText(formPage, formUrl, formId, options)),
  };
}

export function fetchActText(portalId: number, options: PortalOptions = {}) {
  return fetchActForm(portalId, null, options);
}

const superscripts: Record<string, string> = {
  '⁰': '0',
  '¹': '1',
  '²': '2',
  '³': '3',
  '⁴': '4',
  '⁵': '5',
  '⁶': '6',
  '⁷': '7',
  '⁸': '8',
  '⁹': '9',
};

const superscriptRun = /[⁰¹²³⁴⁵⁶⁷⁸⁹]+/g;

export function plainLabel(label: string) {
  return label.replace(
    superscriptRun,
    (run) => `^${[...run].map((character) => superscripts[character]).join('')}`
  );
}

export const isRepealed = (unit: ActUnit) =>
  unit.content.length > 0 &&
  unit.content.every(
    (item) => typeof item === 'string' && /^abrogat[ăae]?\s*[.;,]?$/i.test(item.trim())
  );

export function unitLines(unit: ActUnit, { heading = false } = {}): string[] {
  const lines: string[] = [];
  if (heading && unit.heading) lines.push(unit.heading);
  const prefix = !unit.label
    ? ''
    : unit.kind === 'alineat'
      ? `(${unit.label}) `
      : unit.kind === 'letter'
        ? `${unit.label}) `
        : unit.kind === 'point'
          ? `${unit.label}. `
          : '';
  let first = true;
  for (const item of unit.content) {
    if (typeof item === 'string') {
      lines.push(first && prefix ? `${prefix}${item}` : item);
    } else {
      if (isRepealed(item)) continue;
      if (first && prefix) lines.push(prefix.trim());
      lines.push(
        ...unitLines(item, { heading: item.kind !== 'article' && item.kind !== 'alineat' })
      );
    }
    first = false;
  }
  if (first && prefix) lines.push(prefix.trim());
  return lines;
}

export type UnitMatch = { unit: ActUnit; annex: string | null; ancestors: ActUnit[] };

export function unitsOf(text: ActText, kind: ActUnit['kind'], label: string): UnitMatch[] {
  const wanted = plainLabel(label);
  const found: UnitMatch[] = [];
  const walk = (units: (string | ActUnit)[], annex: string | null, ancestors: ActUnit[]) => {
    for (const unit of units) {
      if (typeof unit === 'string') continue;
      if (unit.kind === kind && plainLabel(unit.label) === wanted) {
        found.push({ unit, annex, ancestors });
      }
      walk(unit.content, unit.kind === 'annex' ? unit.label : annex, [...ancestors, unit]);
    }
  };
  walk(text.content, null, []);
  return found;
}
