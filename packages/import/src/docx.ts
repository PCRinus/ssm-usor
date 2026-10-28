import { XMLParser } from 'fast-xml-parser';
import { strFromU8, unzipSync } from 'fflate';

const parser = new XMLParser({
  preserveOrder: true,
  ignoreAttributes: true,
  trimValues: false,
  // Otherwise text such as a CAEN code or a phone number is read as a number and loses its
  // leading zeros.
  parseTagValue: false,
  // Despite its name, needed for XML too: without it numeric references (&#x219;) stay as written.
  htmlEntities: true,
});

type XmlNode = Record<string, unknown>;

const tagOf = (node: XmlNode) => Object.keys(node).find((key) => key !== ':@') ?? '';

const childrenOf = (node: XmlNode) => {
  const children = node[tagOf(node)];
  return Array.isArray(children) ? (children as XmlNode[]) : [];
};

function textOf(node: XmlNode): string {
  const tag = tagOf(node);
  switch (tag) {
    // Only a run's text is the document's: whitespace between tags is the file's indentation.
    case 'w:t':
      return childrenOf(node)
        .map((child) => String(child['#text'] ?? ''))
        .join('');
    case '#text':
      return '';
    case 'w:tab':
    case 'w:br':
    case 'w:cr':
      return ' ';
    case 'w:noBreakHyphen':
      return '-';
    // Field codes ("PAGE", "MERGEFIELD …") and tracked deletions are not the document's text,
    // and a drawing's fallback repeats the text box it stands for.
    case 'w:instrText':
    case 'w:delText':
    case 'mc:Fallback':
      return '';
    default:
      return childrenOf(node).map(textOf).join('');
  }
}

const squash = (text: string) => text.replace(/\s+/g, ' ').trim();

function render(nodes: XmlNode[], lines: string[]) {
  for (const node of nodes) {
    const tag = tagOf(node);
    if (tag === 'w:p') {
      const text = squash(textOf(node));
      if (text) lines.push(text);
    } else if (tag === 'w:tbl') {
      for (const row of childrenOf(node).filter((child) => tagOf(child) === 'w:tr')) {
        const cells = childrenOf(row)
          .filter((child) => tagOf(child) === 'w:tc')
          .map((cell) => {
            const inner: string[] = [];
            render(childrenOf(cell), inner);
            return inner.join(' / ').replace(/\|/g, '/');
          });
        if (cells.some(Boolean)) lines.push(`| ${cells.join(' | ')} |`);
      }
      lines.push('');
    } else if (tag !== '#text' && tag !== 'w:sectPr') {
      render(childrenOf(node), lines);
    }
  }
}

const partOrder = (name: string) =>
  name.includes('header') ? 0 : name.includes('document') ? 1 : 2;

const textPart = /^word\/(header\d*|document|footer\d*)\.xml$/;

export class DocxReadError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'DocxReadError';
  }
}

// fflate inflates a part into a buffer of its declared size, so capping that bounds the memory a
// deflate bomb can take in a 128 MiB Worker.
const maxTextBytes = 16 * 1024 * 1024;

export function docxToText(bytes: Uint8Array): string {
  let files: Record<string, Uint8Array>;
  let textBytes = 0;
  try {
    // Only the text parts are inflated; images would cost a Worker's memory for nothing.
    files = unzipSync(bytes, {
      filter: (file) => {
        if (!textPart.test(file.name)) return false;
        textBytes += file.originalSize;
        if (textBytes > maxTextBytes) {
          throw new DocxReadError('The Word document is too large to read.');
        }
        return true;
      },
    });
  } catch (error) {
    if (error instanceof DocxReadError) throw error;
    throw new DocxReadError('The file is not a Word document.', { cause: error });
  }
  const parts = Object.keys(files)
    .filter((name) => textPart.test(name))
    .sort((a, b) => partOrder(a) - partOrder(b) || a.localeCompare(b, 'en', { numeric: true }));
  if (!parts.includes('word/document.xml')) {
    throw new DocxReadError('The file is not a Word document.');
  }
  const seen = new Set<string>();
  const blocks: string[] = [];
  for (const part of parts) {
    const lines: string[] = [];
    render(parser.parse(strFromU8(files[part]!)) as XmlNode[], lines);
    const block = lines.join('\n').trim();
    if (block === '' || seen.has(block)) continue;
    seen.add(block);
    blocks.push(block);
  }
  return blocks.join('\n\n').replace(/\n{3,}/g, '\n\n');
}
