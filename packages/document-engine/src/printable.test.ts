import PizZip from 'pizzip';
import { describe, expect, it, vi } from 'vitest';

import { printableDocx } from './printable';
import { read } from './templates/read';
import { printedContents } from './toc';

vi.mock('./toc', async (original) => {
  const actual = await original<typeof import('./toc')>();
  return { ...actual, printedContents: vi.fn(actual.printedContents) };
});

const documentOf = (docx: Uint8Array) => new PizZip(docx).file('word/document.xml')!.asText();

describe('the file a contents is printed from', () => {
  it('writes the contents of the occupational safety set as entries with page references', () => {
    const printed = documentOf(printableDocx(read('2.2_general_training_material.docx')));
    expect(printed).not.toContain('Table of Contents');
    expect(printed).not.toMatch(/<w:instrText[^>]*> TOC /);
    const references = [...printed.matchAll(/PAGEREF (_Toc\d+) \\h/g)].map((match) => match[1]);
    expect(references).toHaveLength(19);
    for (const name of references) expect(printed).toContain(`w:name="${name}"`);
  });

  it('leaves a file without a label column, as the fire-safety set has, as it is', () => {
    const fire = read('fire/2.1_fire_own_instructions.docx');
    expect(printableDocx(fire)).toBe(fire);
  });

  it('leaves a file without contents, or that is no Word file, as it is', () => {
    const decision = read('1.1_decision_training.docx');
    expect(printableDocx(decision)).toBe(decision);
    const notWord = new TextEncoder().encode('%PDF-1.7');
    expect(printableDocx(notWord)).toBe(notWord);
  });

  it('converts a file as it is when a reference would not find its heading', () => {
    vi.mocked(printedContents).mockImplementationOnce((document) =>
      document.replace(
        '<w:body>',
        '<w:body><w:p><w:r><w:instrText xml:space="preserve"> PAGEREF _TocMissing \\h </w:instrText></w:r></w:p>'
      )
    );
    const docx = read('2.2_general_training_material.docx');
    expect(printableDocx(docx)).toBe(docx);
  });
});
