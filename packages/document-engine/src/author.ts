import PizZip from 'pizzip';

// Turns a provider's Word file into a template by replacing literal text with placeholders.
//
// Word splits what reads as one phrase into several runs, one per formatting change or
// editing session: "S.C. VELOCITA URBANA" + " " + "S.R.L." is three <w:t> elements. A plain
// search over the XML never finds the phrase. This works on a paragraph's text as a reader
// sees it, maps every character back to its run, puts the replacement in the run where the
// match starts, and removes the matched characters from the runs that follow. Formatting is
// untouched: the placeholder takes the formatting of the first matched character.

export interface Replacement {
  /** Literal text as it reads in the document, spaces included. */
  find?: string;
  /**
   * A regular expression instead of `find`, for a phrase the original spells several ways:
   * "S.C. X  S.R.L.", "S.C. X SRL", "S.C. X S.R.L,". Matched per paragraph.
   */
  pattern?: string;
  replace: string;
  /** Fail unless the text is found at least this many times. Default 1. */
  min?: number;
  /**
   * Match only a paragraph whose whole text, trimmed, is `find`: a table cell holding just a
   * name, as opposed to the same name inside a sentence.
   */
  whole?: boolean;
  /**
   * Repeat the matched paragraph once per item of this list, by putting `{{#list}}` and
   * `{{/list}}` in paragraphs of their own around it, which is what makes the engine repeat
   * a paragraph instead of repeating text inside it.
   */
  loopParagraph?: string;
}

export interface AuthoringReport {
  part: string;
  /** The `find` text, or the `pattern` between slashes. */
  find: string;
  count: number;
}

const paragraphPattern = /<w:p[ >][\s\S]*?<\/w:p>/g;
const textPattern = /(<w:t(?: [^>]*)?>)([^<]*)(<\/w:t>)/g;

const decode = (text: string) =>
  text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');

const encode = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

type Matcher = (text: string, from: number) => { start: number; length: number } | null;

function matcherFor({ find, pattern }: Replacement): Matcher {
  if (pattern !== undefined) {
    return (text, from) => {
      const expression = new RegExp(pattern, 'g');
      expression.lastIndex = from;
      const match = expression.exec(text);
      // An empty match would never advance.
      return match && match[0].length > 0 ? { start: match.index, length: match[0].length } : null;
    };
  }
  if (!find) throw new Error('A replacement needs `find` or `pattern`.');
  return (text, from) => {
    const start = text.indexOf(find, from);
    return start === -1 ? null : { start, length: find.length };
  };
}

function replaceInParagraph(paragraph: string, match: Matcher, replace: string, whole: boolean) {
  let texts: string[] = [];
  paragraph.replace(textPattern, (_, __, text: string) => {
    texts.push(decode(text));
    return '';
  });
  if (texts.length === 0) return { paragraph, count: 0 };
  if (whole) {
    const text = texts.join('');
    const lead = text.length - text.trimStart().length;
    const found = match(text, 0);
    if (!found || found.start !== lead || found.length !== text.trim().length) {
      return { paragraph, count: 0 };
    }
  }

  let count = 0;
  let searchFrom = 0;
  for (;;) {
    const joined = texts.join('');
    const found = match(joined, searchFrom);
    if (!found) break;
    const { start } = found;
    const end = start + found.length;
    count += 1;

    // Which run owns each character of the paragraph.
    const owners: number[] = [];
    texts.forEach((text, run) => {
      for (let index = 0; index < text.length; index += 1) owners.push(run);
    });
    const rebuilt = texts.map(() => '');
    for (let index = 0; index < joined.length; index += 1) {
      const run = owners[index]!;
      if (index === start) rebuilt[run] = (rebuilt[run] ?? '') + replace;
      if (index < start || index >= end) rebuilt[run] = (rebuilt[run] ?? '') + joined.charAt(index);
    }
    texts = rebuilt;
    // Continue after the replacement, so a placeholder containing its own search text ends.
    searchFrom = start + replace.length;
  }
  if (count === 0) return { paragraph, count };

  let run = 0;
  const rewritten = paragraph.replace(textPattern, (_, open: string, __, close: string) => {
    const text = texts[run]!;
    run += 1;
    // Leading and trailing spaces survive only with xml:space="preserve".
    const tag = /xml:space=/.test(open) ? open : open.replace('<w:t', '<w:t xml:space="preserve"');
    return `${tag}${encode(text)}${close}`;
  });
  return { paragraph: rewritten, count };
}

const label = ({ find, pattern }: Replacement) =>
  pattern !== undefined ? `/${pattern}/` : (find ?? '');

// A paragraph holding only a loop tag. The engine removes it when it renders the loop.
const tagParagraph = (tag: string) => `<w:p><w:r><w:t>${tag}</w:t></w:r></w:p>`;

/** A shared editorial pass: a dictionary of whole words, then phrases. */
export interface Wording {
  /** "securitatii": "securității". Applied as whole words, in lower, Capitalised and UPPER case. */
  words: Record<string, string>;
  /** Rewordings, as replacements. None of them has to occur in every document. */
  phrases: Replacement[];
}

const letters = 'A-Za-zĂÂÎȘȚăâîșțŞŢşţ';
const capitalise = (word: string) => word.charAt(0).toLocaleUpperCase('ro') + word.slice(1);

/** Turns a wording file into replacements. Phrases go first: they are written against the original text. */
export function wordingReplacements({ words, phrases }: Wording): Replacement[] {
  const replacements: Replacement[] = phrases.map((phrase) => ({ min: 0, ...phrase }));
  for (const [from, to] of Object.entries(words)) {
    const variants = new Map([
      [from, to],
      [capitalise(from), capitalise(to)],
      [from.toLocaleUpperCase('ro'), to.toLocaleUpperCase('ro')],
    ]);
    for (const [find, replace] of variants) {
      // A whole word, never the inside of a longer one or of a placeholder's dotted name. A
      // full stop after the word is fine: it ends the sentence.
      const escaped = find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      replacements.push({
        pattern: `(?<![${letters}{])(?<![A-Za-z]\\.)${escaped}(?![${letters}}])(?!\\.[A-Za-z])`,
        replace,
        min: 0,
      });
    }
  }
  return replacements;
}

export interface AuthoringOptions {
  /**
   * Font colours to drop, as Word writes them ("FF0000"). Providers mark what they replace by
   * hand in red; a generated document should not carry their markings.
   */
  removeColors?: string[];
}

/** Applies replacements to every paragraph of one XML part, across run boundaries. */
export function replaceInXml(xml: string, replacements: Replacement[]) {
  let result = xml;
  for (const replacement of replacements) {
    const match = matcherFor(replacement);
    result = result.replace(
      paragraphPattern,
      (paragraph) =>
        replaceInParagraph(paragraph, match, replacement.replace, replacement.whole ?? false)
          .paragraph
    );
  }
  return result;
}

export const isTextPart = (name: string) =>
  /^word\/(document|header\d*|footer\d*)\.xml$/.test(name);

/** Replaces text in the body, the headers, and the footers of a `.docx`. */
export function authorTemplate(
  source: Uint8Array,
  replacements: Replacement[],
  { removeColors = [] }: AuthoringOptions = {}
) {
  const zip = new PizZip(source);
  const parts = Object.keys(zip.files).filter((name) =>
    /^word\/(document|header\d*|footer\d*)\.xml$/.test(name)
  );
  const report: AuthoringReport[] = [];
  const totals = new Map<string, number>();

  for (const part of parts) {
    let xml = zip.file(part)!.asText();
    for (const replacement of replacements) {
      const { replace, whole = false, loopParagraph } = replacement;
      const find = label(replacement);
      const match = matcherFor(replacement);
      let count = 0;
      xml = xml.replace(paragraphPattern, (paragraph) => {
        const result = replaceInParagraph(paragraph, match, replace, whole);
        count += result.count;
        if (result.count === 0 || !loopParagraph) return result.paragraph;
        return `${tagParagraph(`{{#${loopParagraph}}}`)}${result.paragraph}${tagParagraph(`{{/${loopParagraph}}}`)}`;
      });
      if (count > 0) report.push({ part, find, count });
      totals.set(find, (totals.get(find) ?? 0) + count);
    }
    for (const color of removeColors) {
      xml = xml.replace(new RegExp(`<w:color w:val="${color}"[^>]*/>`, 'gi'), '');
    }
    zip.file(part, xml);
  }

  const notFound = replacements.filter(
    (replacement) => (totals.get(label(replacement)) ?? 0) < (replacement.min ?? 1)
  );
  if (notFound.length > 0) {
    throw new Error(
      `Text not found often enough in the document: ${notFound.map((replacement) => JSON.stringify(label(replacement))).join(', ')}`
    );
  }
  return {
    template: zip.generate({ type: 'uint8array', compression: 'DEFLATE' }),
    report,
  };
}

/** The text of a `.docx` as a reader sees it, one line per paragraph, for checks and tests. */
export function documentText(source: Uint8Array): string {
  const zip = new PizZip(source);
  const lines: string[] = [];
  for (const name of Object.keys(zip.files).sort()) {
    if (!/^word\/(document|header\d*|footer\d*)\.xml$/.test(name)) continue;
    const xml = zip.file(name)!.asText();
    for (const paragraph of xml.match(paragraphPattern) ?? []) {
      let line = '';
      paragraph.replace(textPattern, (_, __, text: string) => {
        line += decode(text);
        return '';
      });
      if (line.trim()) lines.push(line);
    }
  }
  return lines.join('\n');
}
