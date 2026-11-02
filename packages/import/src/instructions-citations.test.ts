import { describe, expect, it } from 'vitest';

import { parseCitation, resolvePositions } from './instructions-citations';
import type { CutInstruction, InstructionsFile } from './instructions-cut';
import type { DocxParagraph } from './instructions-docx';
import type { InstructionsAnswer } from './instructions-request';
import { article, line, packFile } from './test/instructions-pack';

type Segment =
  { common: number[] } | { key: string; number: string; numbers: number[]; heading?: string };

const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, index) => from + index);

function pack(path: string, segments: Segment[]) {
  const paragraphs: DocxParagraph[] = [];
  const instructions: CutInstruction[] = [];
  for (const segment of segments) {
    const firstParagraph = paragraphs.length;
    if ('common' in segment) {
      paragraphs.push(line('Capitolul comun'));
      for (const number of segment.common)
        paragraphs.push(article(number, `Text comun ${number}.`));
      continue;
    }
    paragraphs.push(line(segment.heading ?? `Subcapitolul ${segment.number}. Instrucțiune`));
    for (const number of segment.numbers) paragraphs.push(article(number, `Text ${number}.`));
    instructions.push({
      key: segment.key,
      file: path,
      number: segment.number,
      title: `Instrucțiunea ${segment.key}`,
      category: 'work_activity',
      location: {
        file: path,
        start: 0,
        end: 0,
        firstParagraph,
        lastParagraph: paragraphs.length - 1,
      },
      body: {
        blocks: segment.numbers.map((number) => ({
          kind: 'article' as const,
          paragraphs: [`Text ${number}.`],
        })),
      },
      articles: segment.numbers.map((number) => ({ sourceNumber: number })),
      flags: [],
    });
  }
  return { file: packFile(path, paragraphs) as InstructionsFile, instructions };
}

type Position = InstructionsAnswer['positions'][number];

const cite = (post: string, citation: string, extra: Partial<Position> = {}): Position => ({
  post,
  variant: '',
  clientPost: '',
  section: 'workplace',
  citation,
  file: 'SSM/Tematica.doc',
  quote: citation,
  ...extra,
});

// Common Art. 1–20, subchapters XIII.I (21–30) and XIII.II (31–40), then blocks numbered on
// their own: I.P.S.S.M. 1 (1–12) and I.P.S.S.M. 2 (1–16).
const ssm = pack('SSM/3.2._IPSSM.docx', [
  { common: range(1, 20) },
  { key: 'cars', number: 'XIII.I', numbers: range(21, 30) },
  { key: 'office', number: 'XIII.II', numbers: range(31, 40) },
  { key: 'cook', number: '1', numbers: range(1, 12) },
  { key: 'receptionist', number: '2', numbers: range(1, 16) },
]);

function resolve(
  citations: Position[],
  packed: { file: InstructionsFile; instructions: CutInstruction[] } = ssm,
  domain: 'ssm' | 'psi' = 'ssm'
) {
  return resolvePositions({
    domain,
    files: [packed.file],
    instructions: packed.instructions,
    positions: citations,
  });
}

const outcome = (citations: Position[], packed = ssm, domain: 'ssm' | 'psi' = 'ssm') =>
  resolve(citations, packed, domain).map((position) => position.resolution);

describe('parseCitation', () => {
  it('reads bare articles as the main numbering and a numbered block as its own', () => {
    expect(parseCitation('ssm', 'IPSSM Art. 1 – 296 ; 331 – 353 ; IPSSM 2. Art.1 – 16')).toEqual([
      { kind: 'articles', scope: { kind: 'main' }, from: 1, to: 296 },
      { kind: 'articles', scope: { kind: 'main' }, from: 331, to: 353 },
      { kind: 'articles', scope: { kind: 'own', number: 2 }, from: 1, to: 16 },
    ]);
  });

  it('reads a block written with points, a leading zero or no space', () => {
    expect(parseCitation('ssm', 'I.P.S.S.M. 05 Art. 1 - 35 ; I.P.S.S.M.2 Art. 1 ;')).toEqual([
      { kind: 'articles', scope: { kind: 'own', number: 5 }, from: 1, to: 35 },
      { kind: 'articles', scope: { kind: 'own', number: 2 }, from: 1, to: 1 },
    ]);
  });

  it('reads annexes, lists of them and chapters', () => {
    expect(
      parseCitation(
        'psi',
        'IPSU Art. 84 – 104, 114 – 129 ; IPSU Cap. XXV – XXXII ; IPSU Anexa 1,2.'
      )
    ).toEqual([
      { kind: 'articles', scope: { kind: 'main' }, from: 84, to: 104 },
      { kind: 'articles', scope: { kind: 'main' }, from: 114, to: 129 },
      { kind: 'chapters', from: 25, to: 32 },
      { kind: 'block', number: 1, written: 'Anexa 1' },
      { kind: 'block', number: 2, written: 'Anexa 2' },
    ]);
  });

  it('reads whole blocks named one after another', () => {
    expect(parseCitation('ssm', 'IPSSM 1, IPSSM 2')).toEqual([
      { kind: 'block', number: 1, written: 'IPSSM 1' },
      { kind: 'block', number: 2, written: 'IPSSM 2' },
    ]);
  });

  it('takes articles after an annex and a separator as the main numbering', () => {
    expect(parseCitation('psi', 'IPSU Anexa 1 ; Art. 5 – 9')).toEqual([
      { kind: 'block', number: 1, written: 'Anexa 1' },
      { kind: 'articles', scope: { kind: 'main' }, from: 5, to: 9 },
    ]);
    expect(parseCitation('psi', 'Anexa nr. 1 Art. 5 – 9')).toEqual([
      { kind: 'articles', scope: { kind: 'own', number: 1 }, from: 5, to: 9 },
    ]);
  });

  it('never reads the general training material, the laws or the other domain’s document', () => {
    expect(parseCitation('ssm', 'Conform MISSMIG Art. 1 – 327')).toEqual([]);
    expect(
      parseCitation('ssm', 'HG 1051/ 2006, H.G. 1146/2006 Art. 3 ; IPSSM Art. 1 – 10')
    ).toEqual([{ kind: 'articles', scope: { kind: 'main' }, from: 1, to: 10 }]);
    expect(parseCitation('ssm', 'IPSU Art. 1 – 83')).toEqual([]);
  });

  it('reads a whole-document citation', () => {
    expect(parseCitation('ssm', 'IPSSM integral')).toEqual([{ kind: 'document' }]);
  });
});

describe('resolvePositions', () => {
  it('names the instructions whose articles all lie in the main ranges, and a block by number', () => {
    expect(
      outcome([cite('Recepționer', 'IPSSM Art. 1 – 20 ; 31 – 40 ; IPSSM 2. Art.1 – 16')])
    ).toEqual([{ kind: 'resolved', instructions: ['office', 'receptionist'] }]);
  });

  it('does not read bare article numbers against the blocks that restart at 1', () => {
    expect(outcome([cite('Director', 'IPSSM Art. 1 – 30')])).toEqual([
      { kind: 'resolved', instructions: ['cars'] },
    ]);
  });

  it('names nothing for a range covering only the common part', () => {
    expect(outcome([cite('Contabil', 'IPSSM Art. 1 – 20')])).toEqual([
      { kind: 'resolved', instructions: [] },
    ]);
  });

  it('names every instruction of the main numbering for the whole document', () => {
    expect(outcome([cite('Vânzător', 'IPSSM Art. 1 – 40')])).toEqual([
      { kind: 'resolved', instructions: ['cars', 'office'] },
    ]);
    expect(outcome([cite('Vânzător', 'IPSSM integral')])).toEqual([
      { kind: 'resolved', instructions: ['cars', 'office', 'cook', 'receptionist'] },
    ]);
  });

  it('leaves a post undecided when its citation cuts an instruction in half', () => {
    expect(outcome([cite('Director', 'IPSSM Art. 1 – 35 ; IPSSM 2. Art.2 – 16')])).toEqual([
      {
        kind: 'undecided',
        reasons: [
          { kind: 'cuts_instruction', instruction: 'office' },
          { kind: 'cuts_instruction', instruction: 'receptionist' },
        ],
      },
    ]);
  });

  it('reads an article left out for having no text on the number the pack printed', () => {
    const packed = pack('SSM/3.2._IPSSM.docx', [
      { common: range(1, 20) },
      { key: 'cars', number: 'XIII.I', numbers: range(21, 30) },
      { key: 'office', number: 'XIII.II', numbers: range(31, 40) },
    ]);
    const cars = packed.instructions[0]!;
    cars.articles = cars.articles.filter((item) => item.sourceNumber !== 30);
    cars.flags = [{ kind: 'empty_article', number: 30 }];
    expect(outcome([cite('Șofer', 'IPSSM Art. 21 – 29')], packed)).toEqual([
      { kind: 'undecided', reasons: [{ kind: 'cuts_instruction', instruction: 'cars' }] },
    ]);
    expect(outcome([cite('Șofer', 'IPSSM Art. 21 – 30')], packed)).toEqual([
      { kind: 'resolved', instructions: ['cars'] },
    ]);
  });

  it('reads a post on the union of its citations, as a periodic training split over months', () => {
    const resolved = resolve([
      cite('Bucătar', 'IPSSM Art. 1 – 10 ; IPSSM 1 Art. 1 – 5', { section: 'periodic' }),
      cite('Bucătar', 'IPSSM Art. 11 – 20 ; IPSSM 1 Art. 6 – 12', { section: 'periodic' }),
    ]);

    expect(resolved).toHaveLength(1);
    expect(resolved[0]!.resolution).toEqual({ kind: 'resolved', instructions: ['cook'] });
    expect(resolved[0]!.citations).toHaveLength(2);
  });

  it('never reads the general training material as the instructions', () => {
    expect(outcome([cite('Întreg personalul', 'Conform MISSMIG Art. 1 – 327')])).toEqual([
      { kind: 'resolved', instructions: [] },
    ]);
  });

  it('merges a post the themes spell twice when both are the same post of the client', () => {
    const resolved = resolve([
      cite('INGRIJITOR HOTEL', 'IPSSM 1. Art 1 – 12', { clientPost: 'Îngrijitor hotel' }),
      cite('INGRIJITOR DE HOTEL', 'IPSSM 1 Art. 1 - 12', {
        clientPost: 'Îngrijitor hotel',
        section: 'periodic',
      }),
    ]);

    expect(resolved.map((position) => [position.post, position.clientPost])).toEqual([
      ['INGRIJITOR HOTEL', 'Îngrijitor hotel'],
    ]);
  });

  it('keeps apart two entries of one post that the themes tell apart', () => {
    const resolved = resolve([
      cite('Mecanic utilaj', 'IPSSM Art. 1 – 40', { clientPost: 'Mecanic utilaj' }),
      cite('Mecanic utilaj', 'IPSSM Art. 1 – 20 ; 31 – 40', {
        clientPost: 'Mecanic utilaj',
        variant: 'FARA CONDUCERE AUTO',
      }),
    ]);

    expect(resolved.map((position) => [position.variant, position.resolution])).toEqual([
      ['', { kind: 'resolved', instructions: ['cars', 'office'] }],
      ['FARA CONDUCERE AUTO', { kind: 'resolved', instructions: ['office'] }],
    ]);
  });

  it('reads bare articles against the bound document, not another file’s own numbering', () => {
    const covid = pack('SSM/Covid.docx', [{ key: 'covid', number: 'XIII.I', numbers: [1, 2] }]);

    const resolved = resolvePositions({
      domain: 'ssm',
      files: [ssm.file, covid.file],
      instructions: [...ssm.instructions, ...covid.instructions],
      positions: [cite('Vânzător', 'IPSSM Art. 1 – 30'), cite('Șofer', 'IPSSM integral')],
    });

    expect(resolved.map((position) => position.resolution)).toEqual([
      { kind: 'resolved', instructions: ['cars'] },
      {
        kind: 'resolved',
        instructions: ['cars', 'office', 'cook', 'receptionist', 'covid'],
      },
    ]);
  });

  describe('a number the pack prints twice', () => {
    // XIII.II prints a stray Art. 21 among its own, as a pasted paragraph keeps its number.
    const stray = pack('SSM/3.2._IPSSM.docx', [
      { common: range(1, 20) },
      { key: 'cars', number: 'XIII.I', numbers: range(21, 30) },
      { key: 'grinder', number: 'XIII.II', numbers: [31, 32, 21, 33, 34] },
      { key: 'ladders', number: 'XIII.III', numbers: range(35, 40) },
    ]);

    it('leaves a post undecided when a cited bound falls in two instructions', () => {
      expect(outcome([cite('Mecanic', 'IPSSM Art. 21 – 40')], stray)).toEqual([
        {
          kind: 'undecided',
          reasons: [{ kind: 'number_twice', scope: { kind: 'main' }, number: 21 }],
        },
      ]);
    });

    it('resolves a range that holds both copies with bounds printed once', () => {
      expect(outcome([cite('Mecanic', 'IPSSM Art. 1 – 40')], stray)).toEqual([
        { kind: 'resolved', instructions: ['cars', 'grinder', 'ladders'] },
      ]);
    });

    it('resolves a range when the copies of a bound stand in one instruction', () => {
      const repeated = pack('SSM/3.2._IPSSM.docx', [
        { common: range(1, 20) },
        { key: 'cleaning', number: 'XIII.I', numbers: [21, 22, 23, 24, 22, 23] },
        { key: 'ladders', number: 'XIII.II', numbers: range(25, 30) },
      ]);

      expect(outcome([cite('Cameristă', 'IPSSM Art. 1 – 23 ; 23 – 24')], repeated)).toEqual([
        { kind: 'resolved', instructions: ['cleaning'] },
      ]);
    });

    it('does not take a numbering restarted outside the instructions for the main one', () => {
      const unlisted = pack('SSM/3.2._IPSSM.docx', [
        { common: range(1, 20) },
        { key: 'cars', number: 'XIII.I', numbers: range(21, 30) },
        { common: range(1, 8) },
      ]);

      expect(outcome([cite('Șofer', 'IPSSM Art. 1 – 30')], unlisted)).toEqual([
        { kind: 'resolved', instructions: ['cars'] },
      ]);
    });
  });

  describe('annexes', () => {
    const psi = pack('PSI/2.2._IPSU.docx', [
      { common: range(1, 187) },
      { key: 'offices', number: '1', numbers: range(1, 30), heading: 'Anexa nr. 1 BIROURI' },
      { key: 'workshops', number: '', numbers: range(1, 20), heading: 'Anexa nr. 2 ATELIERE' },
    ]);

    it('reads the body’s articles and chapters apart from the annexes, numbered from 1', () => {
      expect(
        outcome(
          [
            cite(
              'Director general',
              'IPSU Art. 84 – 104, 114 – 129 ; IPSU Cap. XXV – XXXII ; IPSU Anexa 1'
            ),
          ],
          psi,
          'psi'
        )
      ).toEqual([{ kind: 'resolved', instructions: ['offices'] }]);
    });

    it('knows an annex by its heading when the answer gave it no number', () => {
      expect(outcome([cite('Mecanic', 'IPSU Anexa 1,2.')], psi, 'psi')).toEqual([
        { kind: 'resolved', instructions: ['offices', 'workshops'] },
      ]);
    });

    it('leaves out an annex the pack does not hold, and says so', () => {
      const [position] = resolve(
        [cite('Croitor', 'IPSU Anexa 1'), cite('Croitor', 'IPSU Anexa 3', { section: 'periodic' })],
        psi,
        'psi'
      );

      expect(position!.resolution).toEqual({ kind: 'resolved', instructions: ['offices'] });
      expect(position!.missing).toEqual(['Anexa 3']);
    });

    it('leaves a post undecided when it cites only an annex the pack does not hold', () => {
      expect(outcome([cite('Croitor', 'IPSU Anexa 3')], psi, 'psi')).toEqual([
        { kind: 'undecided', reasons: [{ kind: 'missing_reference', reference: 'Anexa 3' }] },
      ]);
    });

    it('leaves a post undecided when two instructions carry the number it cites', () => {
      const twice = pack('PSI/2.2._IPSU.docx', [
        { common: range(1, 10) },
        { key: 'a', number: '1', numbers: range(1, 5) },
        { key: 'b', number: '1', numbers: range(1, 5) },
      ]);

      expect(outcome([cite('Croitor', 'IPSU Anexa 1')], twice, 'psi')).toEqual([
        { kind: 'undecided', reasons: [{ kind: 'number_shared', number: 1 }] },
      ]);
    });
  });
});
