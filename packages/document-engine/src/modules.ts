import PizZip from 'pizzip';

const paragraphPattern = /<w:p[ >][\s\S]*?<\/w:p>/g;

function paragraphs(zip: PizZip) {
  return zip.file('word/document.xml')?.asText().match(paragraphPattern) ?? [];
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
