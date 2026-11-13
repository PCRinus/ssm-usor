import { decode, encode, paragraphsOf, superscriptDigits } from './text';
import { textHunks } from './token-diff';

// The templates write "art. 30¹" both ways: with the superscript character, or with a digit
// in a run set superscript.
export type SuperscriptStyle = 'characters' | 'runs';

interface TextItem {
  kind: 't';
  open: string;
  text: string;
}
interface MarkupItem {
  kind: 'tab' | 'other';
  xml: string;
}
type Item = TextItem | MarkupItem;

interface Run {
  xml: string;
  open: string;
  properties: string;
  items: Item[];
  superscript: boolean;
  inHyperlink: boolean;
}

type Part = { kind: 'raw'; xml: string } | { kind: 'run'; run: Run };

interface Segment {
  text: string;
  /** Undefined keeps the run's own setting. */
  superscript: boolean | undefined;
}

const runPattern = /<w:r(?=[\s>])[^>]*>[\s\S]*?<\/w:r>/g;
const runContent = /<w:t(?: [^>]*)?>[^<]*<\/w:t>|<w:tab\/>/g;
const superscriptMark = '<w:vertAlign w:val="superscript"/>';
const superscriptOnly = new RegExp(`^[${superscriptDigits}]+$`, 'u');
const superscriptPieces = new RegExp(`[${superscriptDigits}]+|[^${superscriptDigits}]+`, 'gu');

function parseRun(xml: string, inHyperlink: boolean): Run {
  const open = /^<w:r(?=[\s>])[^>]*>/.exec(xml)![0];
  const inner = xml.slice(open.length, -'</w:r>'.length);
  const properties = /^<w:rPr\/>|^<w:rPr>[\s\S]*?<\/w:rPr>/.exec(inner)?.[0] ?? '';
  const content = inner.slice(properties.length);
  const items: Item[] = [];
  let last = 0;
  for (const match of content.matchAll(runContent)) {
    if (match.index > last) items.push({ kind: 'other', xml: content.slice(last, match.index) });
    if (match[0] === '<w:tab/>') items.push({ kind: 'tab', xml: match[0] });
    else {
      const tag = /^<w:t(?: [^>]*)?>/.exec(match[0])![0];
      items.push({ kind: 't', open: tag, text: decode(match[0].slice(tag.length, -6)) });
    }
    last = match.index + match[0].length;
  }
  if (last < content.length) items.push({ kind: 'other', xml: content.slice(last) });
  return {
    xml,
    open,
    properties,
    items,
    superscript: properties.includes(superscriptMark),
    inHyperlink,
  };
}

function parseParagraph(xml: string): Part[] {
  const parts: Part[] = [];
  let last = 0;
  let links = 0;
  const raw = (text: string) => {
    for (const tag of text.matchAll(/<(\/?)w:hyperlink\b[^>]*?(\/?)>/g)) {
      if (tag[1]) links -= 1;
      else if (!tag[2]) links += 1;
    }
    parts.push({ kind: 'raw', xml: text });
  };
  for (const match of xml.matchAll(runPattern)) {
    if (match.index > last) raw(xml.slice(last, match.index));
    parts.push({ kind: 'run', run: parseRun(match[0], links > 0) });
    last = match.index + match[0].length;
  }
  parts.push({ kind: 'raw', xml: xml.slice(last) });
  return parts;
}

const readerText = (item: TextItem, run: Run) =>
  run.superscript
    ? item.text.replace(/\d/g, (digit) => superscriptDigits[Number(digit)]!)
    : item.text;

const storedText = (text: string, superscript: boolean) =>
  superscript
    ? text.replace(new RegExp(`[${superscriptDigits}]`, 'gu'), (digit) =>
        String(superscriptDigits.indexOf(digit))
      )
    : text;

// CT_RPr is a sequence: vertAlign goes after the size, underline and shading and before the
// language, or Word reports the file as damaged.
const afterVertAlign = /<w:(?:rtl|cs|em|lang|eastAsianLayout|specVanish|oMath)\b/;
const vertAlign = /<w:vertAlign\b[^>]*\/>/;

function withSuperscript(properties: string, superscript: boolean) {
  if (!superscript) return properties.replace(superscriptMark, '');
  if (!properties || properties === '<w:rPr/>') return `<w:rPr>${superscriptMark}</w:rPr>`;
  if (vertAlign.test(properties)) return properties.replace(vertAlign, superscriptMark);
  const next = afterVertAlign.exec(properties);
  const at = next ? next.index : properties.length - '</w:rPr>'.length;
  return properties.slice(0, at) + superscriptMark + properties.slice(at);
}

function textElement(open: string, text: string, superscript: boolean) {
  // Leading and trailing spaces survive only with xml:space="preserve".
  const tag =
    /^\s|\s$/.test(text) && !open.includes('xml:space=')
      ? open.replace('<w:t', '<w:t xml:space="preserve"')
      : open;
  return `${tag}${encode(storedText(text, superscript))}</w:t>`;
}

interface Unit {
  xml: (superscript: boolean) => string;
  superscript: boolean;
}

function serializeRun(run: Run, segments: Map<TextItem, Segment[]>, removedTabs: Set<Item>) {
  const units: Unit[] = [];
  for (const item of run.items) {
    if (item.kind === 't') {
      for (const segment of segments.get(item)!) {
        if (!segment.text) continue;
        units.push({
          xml: (superscript) => textElement(item.open, segment.text, superscript),
          superscript: segment.superscript ?? run.superscript,
        });
      }
    } else if (!removedTabs.has(item)) {
      units.push({ xml: () => item.xml, superscript: run.superscript });
    }
  }
  const groups: Unit[][] = [];
  for (const unit of units) {
    const group = groups.at(-1);
    if (group && group[0]!.superscript === unit.superscript) group.push(unit);
    else groups.push([unit]);
  }
  return groups
    .map((group) => {
      const { superscript } = group[0]!;
      const properties =
        superscript === run.superscript
          ? run.properties
          : withSuperscript(run.properties, superscript);
      return `${run.open}${properties}${group.map((unit) => unit.xml(superscript)).join('')}</w:r>`;
    })
    .join('');
}

// Words written into a run inside an insertion, a deletion or a run whose formatting change is
// tracked would read as part of that revision.
const tracked = /<w:(?:ins|del|moveFrom|moveTo|rPrChange)\b/;

interface Owner {
  run: Run;
  item: Item;
}

/**
 * The paragraph with its text, as `paragraphsOf` reads it, changed to `text`, touching only
 * the words that differ. A new word takes the formatting of the words it replaces, or of the
 * longer run beside it, so the words added after a bold "(2)" are not bold.
 */
export function rewriteParagraph(
  xml: string,
  text: string,
  superscripts: SuperscriptStyle = 'characters'
): string {
  const parts = parseParagraph(xml);
  const owners: Owner[] = [];
  const segments = new Map<TextItem, Segment[]>();
  let before = '';
  for (const part of parts) {
    if (part.kind !== 'run') continue;
    for (const item of part.run.items) {
      if (item.kind === 'other') continue;
      if (item.kind === 't') segments.set(item, []);
      const value = item.kind === 't' ? readerText(item, part.run) : ' ';
      for (let index = 0; index < value.length; index += 1) owners.push({ run: part.run, item });
      before += value;
    }
  }
  if (before === text) return xml;
  if (tracked.test(xml.replace(/<w:pPr>[\s\S]*?<\/w:pPr>/, ''))) {
    throw new Error(
      `The paragraph "${before.slice(0, 60)}" holds tracked changes; accept or reject them in Word first.`
    );
  }
  // A paragraph's text outside a run's w:t, a field's result in a w:fldSimple for one, would
  // be read but could not be edited here.
  if (before !== (paragraphsOf(xml)[0]?.text ?? '')) {
    throw new Error(`The paragraph "${before.slice(0, 60)}" holds text outside its runs.`);
  }

  const runLength = (run: Run) => owners.filter((owner) => owner.run === run).length;
  const isSuperscript = (piece: string) => superscriptOnly.test(piece);
  const fits = (run: Run, piece: string) =>
    run.superscript ? isSuperscript(piece) : !isSuperscript(piece) || superscripts === 'characters';
  const append = (item: TextItem, value: string, superscript: boolean | undefined) => {
    const list = segments.get(item)!;
    const last = list.at(-1);
    if (last && last.superscript === superscript) last.text += value;
    else list.push({ text: value, superscript });
  };
  const textOwner = (from: number, step: 1 | -1) => {
    for (let index = from; index >= 0 && index < owners.length; index += step) {
      const owner = owners[index]!;
      if (owner.item.kind === 't') return owner as Owner & { item: TextItem };
    }
    return undefined;
  };

  let unplaced = '';
  const insert = (start: number, end: number, value: string) => {
    const pieces = value.match(superscriptPieces) ?? [];
    if (!pieces.length) return;
    const main = pieces.find((piece) => !isSuperscript(piece)) ?? pieces[0]!;
    const replaced = start < end ? textOwner(start, 1) : undefined;
    // New words beside a link go outside it: inside, they would become part of the link.
    const around = [textOwner(start - 1, -1), textOwner(end, 1)]
      .filter((owner) => owner !== undefined)
      .sort(
        (a, b) =>
          Number(a.run.inHyperlink) - Number(b.run.inHyperlink) ||
          runLength(b.run) - runLength(a.run)
      );
    const candidates = [...(replaced ? [replaced] : []), ...around];
    const target = candidates.find((owner) => fits(owner.run, main)) ?? candidates[0];
    if (!target) {
      unplaced += value;
      return;
    }
    for (const piece of pieces) {
      append(target.item, piece, fits(target.run, piece) ? undefined : !target.run.superscript);
    }
  };

  const removedTabs = new Set<Item>();
  const keep = (index: number) => {
    const { item } = owners[index]!;
    if (item.kind === 't') append(item, before[index]!, undefined);
  };
  let position = 0;
  for (const hunk of textHunks(before, text)) {
    for (; position < hunk.start; position += 1) keep(position);
    insert(hunk.start, hunk.end, hunk.insert);
    for (let index = hunk.start; index < hunk.end; index += 1) {
      const { item } = owners[index]!;
      if (item.kind === 'tab') removedTabs.add(item);
    }
    position = hunk.end;
  }
  for (; position < before.length; position += 1) keep(position);

  const touched = (run: Run) =>
    run.items.some((item) =>
      item.kind === 't'
        ? segments.get(item)!.some((segment) => segment.superscript !== undefined) ||
          segments
            .get(item)!
            .map((segment) => segment.text)
            .join('') !== readerText(item, run)
        : removedTabs.has(item)
    );
  let rewritten = parts
    .map((part) =>
      part.kind === 'raw'
        ? part.xml
        : touched(part.run)
          ? serializeRun(part.run, segments, removedTabs)
          : part.run.xml
    )
    .join('');
  if (unplaced) {
    // Revision marks belong to the paragraph mark: a run's formatting may not carry them.
    const untracked = xml.replace(/<w:(pPrChange|rPrChange)\b[\s\S]*?<\/w:\1>/g, '');
    const mark = (
      /<w:pPr>[\s\S]*?(<w:rPr>[\s\S]*?<\/w:rPr>)[\s\S]*?<\/w:pPr>/.exec(untracked)?.[1] ?? ''
    ).replace(/<w:(?:ins|del|moveFrom|moveTo)\b[^>]*\/>/g, '');
    rewritten = rewritten.replace(
      /<\/w:p>$/,
      `<w:r>${mark}${textElement('<w:t>', unplaced, false)}</w:r></w:p>`
    );
  }
  return rewritten;
}
