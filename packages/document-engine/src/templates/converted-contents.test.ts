import { createServerAutomationHost } from '@docx-editor.dev/core/automation';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import PizZip from 'pizzip';
import { describe, expect, it } from 'vitest';

import { setSamples } from '../../tools/set-samples';
import { renderDocument } from '../render';
import { convert, converter } from '../test/converter';
import { read } from './read';

type Piece = { text: string; bold: boolean; page: number };

async function contentsAndOutline(pdf: Uint8Array) {
  const loading = getDocument({
    data: pdf.slice(),
    useSystemFonts: false,
    fontExtraProperties: true,
  });
  const document = await loading.promise;
  try {
    const outline: number[] = [];
    const chapters: { page: number; fromTop: number }[] = [];
    const walk = async (items: Awaited<ReturnType<typeof document.getOutline>>, depth: number) => {
      for (const item of items ?? []) {
        const destination =
          typeof item.dest === 'string' ? await document.getDestination(item.dest) : item.dest;
        const page = (await document.getPageIndex(destination![0])) + 1;
        outline.push(page);
        if (depth === 1) {
          const [, , , height] = (await document.getPage(page)).view;
          chapters.push({ page, fromTop: height! - Number(destination![3]) });
        }
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
          page: number,
        });
      }
    }
    return { pieces, outline, chapters };
  } finally {
    await loading.destroy();
  }
}

// What a member's edit leaves: the in-app editor writes the file again, its own way.
function savedByEditor(docx: Uint8Array) {
  const opened = createServerAutomationHost(docx);
  if (!opened.ok) throw new Error('The editor did not open the file.');
  const saved = opened.host.save();
  if (!saved.ok) throw new Error('The editor did not save the file.');
  return saved.bytes;
}

// A heading in a text box, which Word saves twice: a shape, and a copy for older readers.
function withHeadingInTextBox(docx: Uint8Array) {
  const zip = new PizZip(docx);
  const xml = zip.file('word/document.xml')!.asText();
  const heading =
    '<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Capitolul XX. Titlu din caseta</w:t></w:r></w:p>';
  const box =
    '<w:p><w:r><mc:AlternateContent><mc:Choice Requires="wps"><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">' +
    '<wp:extent cx="3000000" cy="600000"/><wp:docPr id="9001" name="Caseta"/>' +
    '<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingShape">' +
    '<wps:wsp><wps:cNvSpPr txBox="1"/><wps:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="3000000" cy="600000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></wps:spPr>' +
    `<wps:txbx><w:txbxContent>${heading}</w:txbxContent></wps:txbx><wps:bodyPr/></wps:wsp></a:graphicData></a:graphic></wp:inline></w:drawing></mc:Choice>` +
    `<mc:Fallback><w:pict><v:shape id="Caseta1" type="#_x0000_t202" style="width:236pt;height:47pt"><v:textbox><w:txbxContent>${heading}</w:txbxContent></v:textbox></v:shape></w:pict></mc:Fallback>` +
    '</mc:AlternateContent></w:r></w:p>';
  const third = [...xml.matchAll(/<w:pStyle w:val="Heading1"\/>[\s\S]*?<\/w:p>/g)][3]!;
  const at = third.index + third[0].length;
  zip.file('word/document.xml', xml.slice(0, at) + box + xml.slice(at));
  return zip.generate({ type: 'uint8array' });
}

describe.skipIf(!converter)('the contents of the occupational safety set, in the PDF', () => {
  const files = [
    '2.2_general_training_material.docx',
    '3.2_own_instructions.docx',
    '9_risk_assessment.docx',
    '11.1_employer_briefing.docx',
  ];
  const cases = files.flatMap((name) =>
    setSamples.flatMap(({ label, data }) => [
      { name, label, docx: () => renderDocument(read(name), data) },
      ...(label === 'long'
        ? [
            {
              name,
              label: 'saved by the editor',
              docx: () => savedByEditor(renderDocument(read(name), data)),
            },
          ]
        : []),
    ])
  );

  it.each(cases)(
    "$name ($label) prints each heading's page and its label in bold",
    async ({ docx }) => {
      const pdf = await convert(docx());
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

  it.each(cases)(
    '$name ($label) starts every chapter on a page of its own, after the contents',
    async ({ docx }) => {
      const { pieces, chapters } = await contentsAndOutline(await convert(docx()));
      const contentsPages = new Set(
        pieces.filter((piece) => /^\.{3,}$/.test(piece.text.trim())).map((piece) => piece.page)
      );
      expect(chapters.length).toBeGreaterThan(5);
      for (const { page, fromTop } of chapters) {
        expect(contentsPages.has(page), String(page)).toBe(false);
        // Under the header box, the first line of its page.
        expect(fromTop, String(page)).toBeLessThan(200);
      }
    },
    60_000
  );

  it('leaves a heading in a text box out, and prints no reference it cannot resolve', async () => {
    const sample = setSamples.find((each) => each.label === 'long')!.data;
    const docx = withHeadingInTextBox(
      renderDocument(read('2.2_general_training_material.docx'), sample)
    );
    const { pieces, outline } = await contentsAndOutline(await convert(docx));
    const text = pieces.map((piece) => piece.text).join('');
    expect(text).not.toContain('Reference source not found');
    const printed = pieces.flatMap((piece, index) =>
      /^\.{3,}$/.test(pieces[index - 1]?.text.trim() ?? '') && /^\d+$/.test(piece.text.trim())
        ? [Number(piece.text)]
        : []
    );
    expect(printed.length).toBe(19);
    expect(outline).toEqual(expect.arrayContaining(printed));
  }, 60_000);
});
