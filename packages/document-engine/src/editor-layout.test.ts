import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  createPackagedFileFetch,
  openFontBackedDocumentForExport,
} from '@docx-editor.dev/core/export';
import {
  type BlockFragmentRecord,
  HARD_MAX_FONT_BYTES,
  type SemanticLayout,
} from '@docx-editor.dev/core/layout';
import { FONT_ASSET_ROOT, packagedFonts } from '@docx-editor.dev/fonts';
import PizZip from 'pizzip';
import { describe, expect, it } from 'vitest';

import { annexTitlePage } from './annex-title';

// Outside a bundler the packaged faces are files; without them the engine measures every glyph
// the same width and breaks pages elsewhere than the browser does.
const fonts = packagedFonts({
  allow: ['Arial'],
  fetcher: createPackagedFileFetch({
    trustedRoot: new URL('./', FONT_ASSET_ROOT),
    maxBytes: HARD_MAX_FONT_BYTES,
  }),
});

const templatesUrl = new URL('../templates/', import.meta.url);
const annexTitle = 'annex title page';
const docxIn = (folder: string) =>
  readdirSync(fileURLToPath(new URL(folder, templatesUrl)))
    .filter((name) => name.endsWith('.docx'))
    .map((name) => `${folder}${name}`);
const files = [...docxIn(''), ...docxIn('fire/'), ...docxIn('other/'), annexTitle];
const read = (name: string) =>
  name === annexTitle
    ? annexTitlePage()
    : new Uint8Array(readFileSync(new URL(name, templatesUrl)));

const words = (text: string) =>
  text
    .replaceAll('\u00ad', '')
    .toLowerCase()
    .match(/\p{L}+|\p{N}+/gu) ?? [];

const counted = (list: string[]) =>
  list.reduce(
    (counts, word) => counts.set(word, (counts.get(word) ?? 0) + 1),
    new Map<string, number>()
  );

const entities: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

// Formulas are laid out as equations, not as lines of text.
function fileText(bytes: Uint8Array) {
  const xml = new PizZip(bytes)
    .file('word/document.xml')!
    .asText()
    .replace(/<m:oMath(Para)?[ >][\s\S]*?<\/m:oMath\1>/g, '');
  return [...xml.matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>|<\/w:p>|<w:(?:tab|br|cr)\/>/g)]
    .map((match) => match[1] ?? ' ')
    .join('')
    .replace(/&(amp|lt|gt|quot|apos);/g, (_, name: string) => entities[name]!);
}

function laidOutText(layout: SemanticLayout) {
  const paragraphs: string[] = [];
  const visit = (blocks: readonly BlockFragmentRecord[]) => {
    for (const block of blocks) {
      if (block.kind === 'paragraph') {
        paragraphs.push(
          block.lines.flatMap((line) => line.spans.map((span) => span.text)).join('')
        );
      } else {
        for (const row of block.rows) for (const cell of row.cells) visit(cell.blocks);
      }
    }
  };
  for (const page of layout.pages) visit(page.fragments);
  return paragraphs.join(' ');
}

describe('in-app editor', () => {
  // The editor refuses a file it cannot paginate, and drops the lines a table cell cannot hold
  // without saying so: a word missing from the pages is how a clipped cell shows.
  it.each(files)(
    '%s opens with every word on its pages',
    async (name) => {
      const bytes = read(name);
      const opened = await openFontBackedDocumentForExport(bytes, {
        fonts,
        displayMode: 'proposed',
      });
      if (!opened.ok) throw new Error(`The editor rejected the file: ${opened.reason}`);
      try {
        const laidOut = counted(words(laidOutText(await opened.session.layout())));
        const missing = [...counted(words(fileText(bytes)))]
          .filter(([word, count]) => (laidOut.get(word) ?? 0) < count)
          .map(([word]) => word);
        expect(missing).toEqual([]);
      } finally {
        opened.session.dispose();
      }
    },
    60_000
  );
});
