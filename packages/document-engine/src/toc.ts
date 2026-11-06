// The import leaves a template's table of contents as an empty TOC field; its entries are
// written from the merged document, so a chapter a loop repeats is listed once per item. They
// carry no page numbers: the PDF conversion recomputes the table with them, as the in-app
// editor and Word do when asked, and a number guessed here would be wrong wherever the pages
// break differently.

const contentsControl =
  /<w:sdt>(?:(?!<\/w:sdt>)[\s\S])*?<w:docPartGallery w:val="Table of Contents"\/>[\s\S]*?<\/w:sdt>/;
const paragraphPattern = /<w:p[ >][\s\S]*?<\/w:p>/g;
const styleDefinition = /<w:style\b([^>]*)>([\s\S]*?)<\/w:style>/g;

const decode = (text: string) =>
  text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');

const encode = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Outline level from 1, by paragraph style id. Word knows a heading style by its name. */
function headingLevels(styles: string) {
  const own = new Map<string, { level: number | null; basedOn: string | null }>();
  for (const [, attributes, body] of styles.matchAll(styleDefinition)) {
    if (!attributes!.includes('w:type="paragraph"')) continue;
    const id = /w:styleId="([^"]+)"/.exec(attributes!)?.[1];
    if (!id) continue;
    const name = /<w:name w:val="heading (\d)"\/>/i.exec(body!)?.[1];
    const outline = /<w:outlineLvl w:val="(\d)"\/>/.exec(body!)?.[1];
    own.set(id, {
      level: name ? Number(name) : outline ? Number(outline) + 1 : null,
      basedOn: /<w:basedOn w:val="([^"]+)"\/>/.exec(body!)?.[1] ?? null,
    });
  }
  const resolve = (id: string, seen: Set<string>): number | null => {
    const style = own.get(id);
    if (!style || seen.has(id)) return null;
    seen.add(id);
    return style.level ?? (style.basedOn ? resolve(style.basedOn, seen) : null);
  };
  return (id: string) => resolve(id, new Set());
}

function outlineRange(instruction: string) {
  const range = /\\o\s+"(\d)-(\d)"/.exec(instruction);
  return range ? { from: Number(range[1]), to: Number(range[2]) } : { from: 1, to: 9 };
}

function headingText(paragraph: string) {
  const parts = paragraph.matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>|<w:(?:tab|br|cr)\/>/g);
  return [...parts]
    .map((part) => (part[1] === undefined ? ' ' : decode(part[1])))
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

function withBookmark(paragraph: string, name: string, id: number) {
  const marks = `<w:bookmarkStart w:id="${id}" w:name="${name}"/><w:bookmarkEnd w:id="${id}"/>`;
  const properties = /^<w:p\b[^>]*>\s*<w:pPr>[\s\S]*?<\/w:pPr>/.exec(paragraph);
  if (properties) return properties[0] + marks + paragraph.slice(properties[0].length);
  const opening = /^<w:p\b[^>]*>/.exec(paragraph)![0];
  return opening + marks + paragraph.slice(opening.length);
}

const fieldRun = (type: 'begin' | 'separate' | 'end') =>
  `<w:r><w:fldChar w:fldCharType="${type}"/></w:r>`;

export function fillTableOfContents(document: string, styles: string): string {
  const control = contentsControl.exec(document);
  if (!control) return document;
  const instruction = /<w:instrText[^>]*>([^<]*\bTOC\b[^<]*)<\/w:instrText>/.exec(control[0]);
  if (!instruction) return document;

  const levelOf = headingLevels(styles);
  const { from, to } = outlineRange(instruction[1]!);
  const takenNames = new Set(
    [...document.matchAll(/<w:bookmarkStart\b[^>]*w:name="([^"]+)"/g)].map((match) => match[1])
  );
  let nextId =
    Math.max(
      0,
      ...[...document.matchAll(/<w:bookmarkStart\b[^>]*w:id="(\d+)"/g)].map((match) =>
        Number(match[1])
      )
    ) + 1;
  let counter = 0;
  const nextName = () => {
    let name: string;
    do name = `_Toc${String((counter += 1)).padStart(9, '0')}`;
    while (takenNames.has(name));
    return name;
  };

  const before = document.slice(0, control.index);
  const after = document.slice(control.index + control[0].length);
  const entries: { level: number; text: string; bookmark: string }[] = [];
  const marked = after.replace(paragraphPattern, (paragraph) => {
    const properties = /^<w:p\b[^>]*>\s*<w:pPr>([\s\S]*?)<\/w:pPr>/.exec(paragraph)?.[1] ?? '';
    const style = /<w:pStyle w:val="([^"]+)"\/>/.exec(properties)?.[1];
    const direct = /<w:outlineLvl w:val="(\d)"\/>/.exec(properties)?.[1];
    const level = direct !== undefined ? Number(direct) + 1 : style ? levelOf(style) : null;
    if (level === null || level < from || level > to) return paragraph;
    const text = headingText(paragraph);
    if (!text) return paragraph;
    const bookmark = nextName();
    entries.push({ level, text, bookmark });
    return withBookmark(paragraph, bookmark, nextId++);
  });
  if (entries.length === 0) return document;

  const rows = entries.map(({ level, text, bookmark }, index) => {
    const opening =
      index === 0 ? `${fieldRun('begin')}<w:r>${instruction[0]}</w:r>${fieldRun('separate')}` : '';
    const closing = index === entries.length - 1 ? fieldRun('end') : '';
    return (
      `<w:p><w:pPr><w:pStyle w:val="TOC${level}"/></w:pPr>${opening}` +
      `<w:hyperlink w:anchor="${bookmark}" w:history="1"><w:r><w:t xml:space="preserve">${encode(text)}</w:t></w:r></w:hyperlink>` +
      `${closing}</w:p>`
    );
  });
  const filled = control[0].replace(
    /<w:sdtContent>[\s\S]*<\/w:sdtContent>/,
    `<w:sdtContent>${rows.join('')}</w:sdtContent>`
  );
  return before + filled + marked;
}
