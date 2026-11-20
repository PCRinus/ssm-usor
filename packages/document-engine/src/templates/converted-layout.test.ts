import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { describe, expect, it } from 'vitest';

import { ssmAnnexData } from '../../tools/annex-samples';
import { setSamples } from '../../tools/set-samples';
import { renderAnnex } from '../annex';
import { renderDocument } from '../render';
import { convert, converter } from '../test/converter';
import { read } from './read';

type Line = { page: number; top: number; left: number; size: number; text: string };

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
        lines.push({
          page,
          top: height - item.transform[5]! - size * 0.905,
          left: item.transform[4]!,
          size,
          text: item.str,
        });
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

  // A table's row numbers hang their text too, but stand closer to the margin than the first tier.
  const tierStep = 18;
  async function listTiers(docx: Uint8Array) {
    const { lines } = await linesOf(await convert(docx));
    const rows = new Map<string, Line[]>();
    for (const line of lines) {
      const key = `${line.page}:${Math.round(line.top)}`;
      rows.set(key, [...(rows.get(key) ?? []), line]);
    }
    const tiers = new Set<number>();
    for (const row of rows.values()) {
      const [label, text] = row.sort((a, b) => a.left - b.left);
      if (!label || !text || !/^(\d{1,2}\.|[a-z]\)|–)$/.test(label.text.trim())) continue;
      const hang = text.left - label.left;
      if (hang < tierStep - 1 || hang > 24 || label.left < 70.87 + tierStep - 1) continue;
      tiers.add(Math.round(((label.left - 70.87) / tierStep) * 10) / 10);
    }
    return [...tiers].sort((a, b) => a - b);
  }

  it.each([
    ['1.1_decision_training.docx', [1, 2, 3]],
    ['11_employer_briefing.docx', [1, 2, 3]],
    ['12_control_regulation.docx', [1, 2]],
  ])(
    '%s steps each list tier 6.35 mm in from the one before, numbers, letters and dashes alike',
    async (name, tiers) => {
      expect(await listTiers(renderDocument(read(name), setSamples[0]!.data))).toEqual(tiers);
    },
    120_000
  );

  it('steps the tiers of an annex as the common part does', async () => {
    const annex = renderAnnex(
      'ssm',
      {
        blocks: [
          {
            kind: 'article',
            paragraphs: [
              'Instruirea cuprinde:',
              '1. Instruirea introductiv-generală:',
              'a) se face pentru:',
              '– lucrătorii nou angajați;',
              '– lucrătorii detașați.',
            ],
          },
        ],
      },
      ssmAnnexData
    );
    expect(await listTiers(annex)).toEqual([1, 2, 3]);
  }, 60_000);

  it('keeps the four registers on four pages for a client name of 130 characters', async () => {
    const { data } = setSamples.at(-1)!;
    const docx = renderDocument(read('7.2_event_registers.docx'), withClient(data, longName));
    expect((await linesOf(await convert(docx))).pages).toBe(4);
  }, 60_000);
});
