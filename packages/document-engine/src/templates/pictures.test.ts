import { readFileSync } from 'node:fs';

import PizZip from 'pizzip';
import { describe, expect, it } from 'vitest';

import { documentTextOf, read } from './read';

type Sign = { name: string; meaning: string | null; pictures: string[] };
const catalogue = JSON.parse(
  readFileSync(new URL('../../tools/import/pictures/catalogue.ro.json', import.meta.url), 'utf8')
) as { '2.2': { heading: string; signs: Sign[] }[]; '11': Sign[] };

const emuPerMm = 914400 / 25.4;
const pictureOf = (name: string, target: string) => {
  const bytes = new PizZip(read(name)).file(`word/${target}`)!.asUint8Array();
  const view = new DataView(bytes.buffer, bytes.byteOffset);
  return { width: view.getUint32(16), height: view.getUint32(20) };
};

function picturesOf(name: string) {
  const zip = new PizZip(read(name));
  const relations = new Map(
    [
      ...zip
        .file('word/_rels/document.xml.rels')!
        .asText()
        .matchAll(/<Relationship Id="([^"]+)" Type="[^"]+\/image" Target="([^"]+)"\/>/g),
    ].map((match) => [match[1]!, match[2]!])
  );
  return [
    ...zip
      .file('word/document.xml')!
      .asText()
      .matchAll(/<w:drawing>[\s\S]*?<\/w:drawing>/g),
  ].map(([drawing]) => {
    const [, cx, cy] = /<wp:extent cx="(\d+)" cy="(\d+)"\/>/.exec(drawing)!;
    const target = relations.get(/r:embed="([^"]+)"/.exec(drawing)![1]!)!;
    return {
      drawing,
      target,
      alt: /<wp:docPr [^>]*descr="([^"]*)"/.exec(drawing)?.[1],
      width: Number(cx) / emuPerMm,
      height: Number(cy) / emuPerMm,
      pixels: pictureOf(name, target),
    };
  });
}

const media = (name: string) =>
  Object.keys(new PizZip(read(name)).files).filter((part) =>
    /^word\/(media|embeddings)\//.test(part)
  );
const tablesOf = (xml: string) => xml.match(/<w:tbl>[\s\S]*?<\/w:tbl>/g) ?? [];

describe.each([
  ['2.2_general_training_material.docx', catalogue['2.2'].flatMap((group) => group.signs)],
  ['11_employer_briefing.docx', catalogue['11']],
])('the sign catalogue of %s', (name, signs) => {
  const body = new PizZip(read(name)).file('word/document.xml')!.asText();
  const catalogues = tablesOf(body).filter((table) => table.includes('<w:drawing'));

  it('prints every sign once, in order, with its meaning where it has one', () => {
    const printed = catalogues.flatMap((table) =>
      (table.match(/<w:tc>[\s\S]*?<\/w:tc>/g) ?? [])
        .filter((cell) => !cell.includes('<w:drawing'))
        .map((cell) => (cell.match(/<w:p\b[\s\S]*?<\/w:p>/g) ?? []).map(documentTextOf))
        .filter((lines) => lines.join(''))
    );
    expect(printed).toEqual(
      signs.map((sign) => [sign.name, ...(sign.meaning ? [sign.meaning] : [])])
    );
  });

  it('draws no line, and shows each sign 14 mm wide at 600 dpi, as a picture in the line', () => {
    for (const table of catalogues) expect(table).not.toMatch(/w:val="single"/);
    const signPictures = picturesOf(name).filter((picture) =>
      catalogues.some((table) => table.includes(picture.drawing))
    );
    expect(signPictures).toHaveLength(signs.flatMap((sign) => sign.pictures).length);
    for (const picture of signPictures) {
      expect(picture.width).toBeCloseTo(14, 2);
      expect(Math.round((picture.width / 25.4) * 600)).toBe(picture.pixels.width);
      expect(picture.height / picture.width).toBeCloseTo(
        picture.pixels.height / picture.pixels.width,
        2
      );
    }
  });

  it('keeps only pictures it shows, all of them PNG', () => {
    const shown = new Set(picturesOf(name).map((picture) => `word/${picture.target}`));
    expect(media(name).filter((part) => !shown.has(part))).toEqual([]);
    expect(media(name).filter((part) => !part.endsWith('.png'))).toEqual([]);
  });
});

describe('2.2_general_training_material.docx', () => {
  const body = new PizZip(read('2.2_general_training_material.docx'))
    .file('word/document.xml')!
    .asText();

  it('heads each kind of sign right after the law describes it', () => {
    const headings = catalogue['2.2'].map((group) => group.heading);
    const paragraphs = (body.match(/<w:p\b[\s\S]*?<\/w:p>/g) ?? []).map(documentTextOf);
    expect(paragraphs.filter((text) => headings.includes(text))).toEqual(headings);
    expect(paragraphs.indexOf('Pericol general*)')).toBeLessThan(
      paragraphs.findIndex((text) => text.startsWith('*) Acest panou de avertizare'))
    );
  });
});

describe('9_risk_assessment.docx', () => {
  const name = '9_risk_assessment.docx';
  const body = new PizZip(read(name)).file('word/document.xml')!.asText();

  it('writes every formula as a formula, none with an empty bound', () => {
    expect(body).not.toContain('<w:object');
    expect(body).not.toMatch(/<m:(lim|e|sub|sup|num|den)><\/m:\1>|<m:(lim|e|sub|sup|num|den)\/>/);
  });

  it('plots the method figures at 600 dpi and their own proportions', () => {
    const figures = picturesOf(name);
    expect(figures.map((figure) => figure.alt)).toEqual([
      'Fig. 1.1',
      'Fig. 1.2',
      'Fig. 1.3',
      'Fig. 1.4',
      'Fig. 1.5. a',
      'Fig. 1.5. b',
    ]);
    for (const figure of figures) {
      expect(Math.round((figure.width / 25.4) * 600)).toBe(figure.pixels.width);
      expect(Math.round((figure.height / 25.4) * 600)).toBe(figure.pixels.height);
    }
  });
});
