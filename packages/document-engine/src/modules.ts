import PizZip from 'pizzip';

import { isTextPart } from './text';

// An instruction module is a Word file kept as its author made it (ADR 012). These helpers
// read what the app needs from one and apply the one change it makes: the fonts.

const houseFont = 'Arial';

const paragraphPattern = /<w:p[ >][\s\S]*?<\/w:p>/g;
const textPattern = /<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g;

const decode = (text: string) =>
  text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');

function paragraphs(zip: PizZip) {
  return zip.file('word/document.xml')?.asText().match(paragraphPattern) ?? [];
}

function textOf(paragraph: string) {
  let line = '';
  paragraph.replace(textPattern, (_, text: string) => {
    line += decode(text);
    return '';
  });
  return line.trim();
}

/** The first line of text, which an uploaded file usually spends on its title. */
export function firstLine(source: Uint8Array): string | null {
  for (const paragraph of paragraphs(new PizZip(source))) {
    const text = textOf(paragraph);
    if (text) return text;
  }
  return null;
}

/**
 * How many top-level items the file's most used numbered list has. Word keeps the numbers
 * out of the text, so this is the count the training themes cite as "Art. 1–N"; a file with
 * no numbered list counts none.
 */
export function countArticles(source: Uint8Array): number {
  const zip = new PizZip(source);
  const styles = zip.file('word/styles.xml')?.asText() ?? '';
  // A style may number its paragraphs for them: "ListParagraph" with a list attached.
  const numberedStyles = new Map<string, string>();
  for (const style of styles.match(/<w:style [\s\S]*?<\/w:style>/g) ?? []) {
    const id = /w:styleId="([^"]+)"/.exec(style)?.[1];
    const numbered = /<w:numPr>(?:(?!<\/w:numPr>)[\s\S])*?<w:numId w:val="(\d+)"\/>/.exec(style);
    const level = /<w:ilvl w:val="(\d+)"\/>/.exec(style)?.[1] ?? '0';
    if (id && numbered && level === '0') numberedStyles.set(id, numbered[1]!);
  }
  const counts = new Map<string, number>();
  for (const paragraph of paragraphs(zip)) {
    const properties = /<w:pPr>[\s\S]*?<\/w:pPr>/.exec(paragraph)?.[0] ?? '';
    const own = /<w:numPr>[\s\S]*?<\/w:numPr>/.exec(properties)?.[0];
    let numId: string | undefined;
    if (own) {
      const level = /<w:ilvl w:val="(\d+)"\/>/.exec(own)?.[1] ?? '0';
      const id = /<w:numId w:val="(\d+)"\/>/.exec(own)?.[1];
      // numId 0 removes a style's numbering from this paragraph.
      if (level === '0' && id && id !== '0') numId = id;
    } else {
      const style = /<w:pStyle w:val="([^"]+)"\/>/.exec(properties)?.[1];
      if (style) numId = numberedStyles.get(style);
    }
    if (numId) counts.set(numId, (counts.get(numId) ?? 0) + 1);
  }
  return Math.max(0, ...counts.values());
}

/**
 * Every font the file names becomes the house font, so the editor, which serves only that
 * one, shows no notice on a document that annexes the module. Nothing else in the file
 * changes.
 */
export function sweepFonts(source: Uint8Array): Uint8Array {
  const zip = new PizZip(source);
  for (const name of Object.keys(zip.files)) {
    if (!(isTextPart(name) || /^word\/(styles|numbering|fontTable)\.xml$/.test(name))) continue;
    const xml = zip.file(name)!.asText();
    const swept = xml
      .replace(
        /<w:rFonts [^>]*\/>/g,
        `<w:rFonts w:ascii="${houseFont}" w:hAnsi="${houseFont}" w:cs="${houseFont}" w:eastAsia="${houseFont}"/>`
      )
      .replace(/<w:font w:name="[^"]*"/g, `<w:font w:name="${houseFont}"`);
    if (swept !== xml) zip.file(name, swept);
  }
  for (const name of Object.keys(zip.files).filter((file) =>
    /^word\/theme\/theme\d*\.xml$/.test(file)
  )) {
    const xml = zip.file(name)!.asText();
    // The theme's font pair is what runs without a font of their own fall back to.
    const swept = xml.replace(/<a:latin typeface="[^"]*"/g, `<a:latin typeface="${houseFont}"`);
    if (swept !== xml) zip.file(name, swept);
  }
  return zip.generate({ type: 'uint8array', compression: 'DEFLATE' });
}
