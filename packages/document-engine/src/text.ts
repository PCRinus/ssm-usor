import PizZip from 'pizzip';

// Word stores what reads as one phrase in several runs, one per formatting change or editing
// session, so text cannot be searched for in the XML. These helpers work on a paragraph's
// text as a reader sees it and map every character back to its run.

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

/** The parts of a `.docx` that hold text a reader sees: the body, the headers, the footers. */
export const isTextPart = (name: string) =>
  /^word\/(document|header\d*|footer\d*)\.xml$/.test(name);

function replaceInParagraph(paragraph: string, pattern: RegExp, replace: string) {
  let texts: string[] = [];
  paragraph.replace(textPattern, (_, __, text: string) => {
    texts.push(decode(text));
    return '';
  });

  let changed = false;
  let searchFrom = 0;
  for (;;) {
    const joined = texts.join('');
    const expression = new RegExp(pattern.source, 'g');
    expression.lastIndex = searchFrom;
    const match = expression.exec(joined);
    // An empty match would never advance.
    if (!match || match[0].length === 0) break;
    const start = match.index;
    const end = start + match[0].length;
    changed = true;

    // Which run owns each character. The replacement goes where the match starts, and the
    // rest of the match is removed from the runs after it, so formatting is untouched.
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
    searchFrom = start + replace.length;
  }
  if (!changed) return paragraph;

  let run = 0;
  return paragraph.replace(textPattern, (_, open: string, __, close: string) => {
    const text = texts[run]!;
    run += 1;
    // Leading and trailing spaces survive only with xml:space="preserve".
    const tag = /xml:space=/.test(open) ? open : open.replace('<w:t', '<w:t xml:space="preserve"');
    return `${tag}${encode(text)}${close}`;
  });
}

/** Replaces a pattern in every paragraph of one XML part, across run boundaries. */
export function replaceText(xml: string, pattern: RegExp, replace: string) {
  return xml.replace(paragraphPattern, (paragraph) =>
    replaceInParagraph(paragraph, pattern, replace)
  );
}

/** The text of a `.docx` as a reader sees it, one line per paragraph. */
export function documentText(source: Uint8Array): string {
  const zip = new PizZip(source);
  const lines: string[] = [];
  for (const name of Object.keys(zip.files).filter(isTextPart).sort()) {
    for (const paragraph of zip.file(name)!.asText().match(paragraphPattern) ?? []) {
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
