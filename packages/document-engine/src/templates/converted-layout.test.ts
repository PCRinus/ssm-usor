import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { describe, expect, it } from 'vitest';

import { setSamples } from '../../tools/set-samples';
import { renderDocument } from '../render';
import { convert, converter } from '../test/converter';
import { read } from './read';

type Line = { page: number; top: number; size: number; text: string };

async function linesOf(pdf: Uint8Array) {
  const loading = getDocument({ data: pdf.slice(), useSystemFonts: false });
  const document = await loading.promise;
  const lines: Line[] = [];
  try {
    for (let page = 1; page <= document.numPages; page += 1) {
      const view = await document.getPage(page);
      const height = view.getViewport({ scale: 1 }).height;
      for (const item of (await view.getTextContent()).items) {
        if (!('str' in item) || !item.str.trim()) continue;
        const size = Math.hypot(item.transform[2]!, item.transform[3]!);
        // The top of the line's em box, as pymupdf measured the covers.
        lines.push({ page, top: height - item.transform[5]! - size * 0.905, size, text: item.str });
      }
    }
  } finally {
    await loading.destroy();
  }
  return { lines, pages: document.numPages };
}

const covers = [
  '1.0_cover_decisions.docx',
  '2.1_cover_general_training_material.docx',
  '3.1_cover_own_instructions.docx',
  '4.1_cover_training_themes.docx',
  '5.0_cover_tests.docx',
  '7.1_cover_event_registers.docx',
  '11.1_cover_employer_briefing.docx',
];
const longName =
  'S.C. ÎNTREPRINDEREA DE CONSTRUCȚII, INSTALAȚII TERMICE, SANITARE ȘI ELECTRICE PENTRU INDUSTRIE ȘI AGRICULTURĂ BANAT-CRIȘANA S.R.L.';
const withClient = (data: Record<string, unknown>, legalName: string) => ({
  ...data,
  client: { ...(data.client as object), legalName },
});

describe.skipIf(!converter)('the converted pages of the occupational safety set', () => {
  it.each(covers)(
    '%s opens its title at 217.8 pt and its hand-over block at 470 pt, on one page even for a long name',
    async (name) => {
      for (const { data } of setSamples) {
        for (const legalName of [undefined, longName]) {
          const merged = legalName ? withClient(data, legalName) : data;
          const { lines, pages } = await linesOf(await convert(renderDocument(read(name), merged)));
          expect(pages).toBe(1);
          const title = lines.find((line) => Math.round(line.size) === 16)!;
          const handover = lines.find((line) => line.text.startsWith('PERSOANE IMPLICATE'))!;
          expect(title.top).toBeCloseTo(217.8, 0);
          if (!legalName) expect(handover.top).toBeCloseTo(470, 0);
        }
      }
    },
    120_000
  );

  it('keeps the four registers on four pages for a client name of 130 characters', async () => {
    const { data } = setSamples.at(-1)!;
    const docx = renderDocument(read('7.2_event_registers.docx'), withClient(data, longName));
    expect((await linesOf(await convert(docx))).pages).toBe(4);
  }, 60_000);
});
