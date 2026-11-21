import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { describe, expect, it } from 'vitest';

import { setSamples } from '../../tools/set-samples';
import { renderDocument } from '../render';
import { convert, converter } from '../test/converter';
import { read } from './read';

type Piece = { text: string; bold: boolean };

// The text of the PDF's first pages, each piece with whether its font is bold, and the page of
// every heading its outline lists.
async function contentsAndOutline(pdf: Uint8Array) {
  const loading = getDocument({
    data: pdf.slice(),
    useSystemFonts: false,
    fontExtraProperties: true,
  });
  const document = await loading.promise;
  try {
    const outline: number[] = [];
    const walk = async (items: Awaited<ReturnType<typeof document.getOutline>>, depth: number) => {
      for (const item of items ?? []) {
        const destination =
          typeof item.dest === 'string' ? await document.getDestination(item.dest) : item.dest;
        outline.push((await document.getPageIndex(destination![0])) + 1);
        if (depth < 2) await walk(item.items, depth + 1);
      }
    };
    await walk(await document.getOutline(), 1);
    const pieces: Piece[] = [];
    for (let number = 1; number <= Math.min(document.numPages, 3); number += 1) {
      const page = await document.getPage(number);
      await page.getOperatorList();
      const content = await page.getTextContent();
      for (const item of content.items) {
        if (!('str' in item)) continue;
        const font = page.commonObjs.get(item.fontName) as { name?: string };
        pieces.push({
          text: item.str + (item.hasEOL ? '\n' : ''),
          bold: /bold/i.test(font.name ?? ''),
        });
      }
    }
    return { pieces, outline };
  } finally {
    await loading.destroy();
  }
}

describe.skipIf(!converter)('the contents of the occupational safety set, in the PDF', () => {
  const sample = setSamples.find((each) => each.label === 'long')!.data;

  it.each([
    '2.2_general_training_material.docx',
    '3.2_own_instructions.docx',
    '9_risk_assessment.docx',
    '11_employer_briefing.docx',
  ])(
    "%s prints each heading's page and its label in bold",
    async (name) => {
      const pdf = await convert(renderDocument(read(name), sample));
      const { pieces, outline } = await contentsAndOutline(pdf);
      expect(pieces.map((piece) => piece.text).join('')).not.toContain(
        'Reference source not found'
      );
      // A number right after a dot leader is the page an entry prints.
      const printed = pieces.flatMap((piece, index) =>
        /^\.{3,}$/.test(pieces[index - 1]?.text.trim() ?? '') && /^\d+$/.test(piece.text.trim())
          ? [Number(piece.text)]
          : []
      );
      expect(printed).toEqual(outline);
      const labels = pieces.filter((piece) =>
        /^((sub)?capitolul|anexa nr\.) [IVXLC\d.]+\.$/i.test(piece.text.trim())
      );
      expect(labels.length).toBeGreaterThan(5);
      for (const label of labels) expect(label.bold, label.text).toBe(true);
    },
    60_000
  );
});
