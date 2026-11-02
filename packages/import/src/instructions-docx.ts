import { XMLParser } from 'fast-xml-parser';
import { strFromU8 } from 'fflate';

import { childrenOf, squash, tagOf, textOf, unzipDocx, type XmlNode } from './docx';
import {
  attributeOf,
  childOf,
  type Numbering,
  numberingPropertiesOf,
  type PrintedNumber,
  readNumbering,
} from './docx-numbering';

const parser = new XMLParser({
  preserveOrder: true,
  ignoreAttributes: false,
  attributeNamePrefix: '',
  trimValues: false,
  parseTagValue: false,
  parseAttributeValue: false,
  htmlEntities: true,
});

export type DocxParagraph = {
  text: string;
  numbered?: PrintedNumber;
  table?: boolean;
};

export type InstructionsDocx = {
  paragraphs: DocxParagraph[];
  // One line per paragraph, in order, its printed number before its text: line i is paragraphs[i].
  text: string;
};

const instructionParts = /^word\/(document|numbering|styles|footnotes|endnotes)\.xml$/;

const noteTypes = new Set(['separator', 'continuationSeparator', 'continuationNotice']);

export const paragraphLine = (paragraph: DocxParagraph) =>
  paragraph.numbered ? `${paragraph.numbered.label} ${paragraph.text}`.trim() : paragraph.text;

function readParagraph(node: XmlNode, numbering: Numbering) {
  const numbered = numbering.next(numberingPropertiesOf(childOf(node, 'w:pPr')));
  return { text: squash(textOf(node)), numbered };
}

function render(nodes: XmlNode[], numbering: Numbering, out: DocxParagraph[]) {
  for (const node of nodes) {
    const tag = tagOf(node);
    if (tag === 'w:p') {
      const { text, numbered } = readParagraph(node, numbering);
      // Word prints the number of an empty numbered paragraph, and the themes count it.
      if (numbered) out.push({ text, numbered });
      else if (text) out.push({ text });
    } else if (tag === 'w:tbl') {
      renderTable(node, numbering, out);
    } else if (tag !== '#text' && tag !== 'w:sectPr' && tag !== 'w:pPr') {
      render(childrenOf(node), numbering, out);
    }
  }
}

// The packs frame whole articles in one-cell tables, so a row with a single filled cell reads as
// the body does; only a row of several cells is a table, and becomes one paragraph.
function renderTable(table: XmlNode, numbering: Numbering, out: DocxParagraph[]) {
  for (const row of childrenOf(table).filter((child) => tagOf(child) === 'w:tr')) {
    const cells = childrenOf(row)
      .filter((child) => tagOf(child) === 'w:tc')
      .map((cell) => {
        const inner: DocxParagraph[] = [];
        render(childrenOf(cell), numbering, inner);
        return inner;
      })
      .filter((inner) => inner.length > 0);
    if (cells.length === 1) {
      out.push(...cells[0]!);
    } else if (cells.length > 1) {
      const text = cells.map((inner) => inner.map(paragraphLine).join(' / ')).join(' – ');
      out.push({ text, table: true });
    }
  }
}

function renderNotes(root: XmlNode[], numbering: Numbering, out: DocxParagraph[]) {
  for (const part of root.filter((node) => tagOf(node) !== '?xml')) {
    for (const note of childrenOf(part)) {
      const type = attributeOf(note, 'w:type');
      if (type !== undefined && noteTypes.has(type)) continue;
      render(childrenOf(note), numbering, out);
    }
  }
}

export function readInstructionsDocx(bytes: Uint8Array): InstructionsDocx {
  const files = unzipDocx(bytes, instructionParts);
  const parse = (name: string) => {
    const file = files[`word/${name}.xml`];
    return file ? (parser.parse(strFromU8(file)) as XmlNode[]) : undefined;
  };
  const numbering = readNumbering(parse('numbering'), parse('styles'));
  const paragraphs: DocxParagraph[] = [];
  render(parse('document') ?? [], numbering.start(), paragraphs);
  // The converter counts a part's lists apart from the body's: the packs' endnote annexes print
  // "Art 1." where counting on from the body would give "Art 188.".
  for (const notes of ['footnotes', 'endnotes']) {
    const root = parse(notes);
    if (root) renderNotes(root, numbering.start(), paragraphs);
  }
  return { paragraphs, text: paragraphs.map(paragraphLine).join('\n') };
}
