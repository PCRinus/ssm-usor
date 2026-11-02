import { describe, expect, it } from 'vitest';

import { cutInstructions } from './instructions-cut';
import type { InstructionsAnswer } from './instructions-request';
import {
  article,
  bakerHeading,
  grinderHeading,
  ipssm,
  line,
  packFile,
  sharedEnding,
  tillHeading,
} from './test/instructions-pack';

type Entry = InstructionsAnswer['instructions'][number];

const entry = (number: string, startWords: string, endWords: string): Entry => ({
  file: ipssm.path,
  number,
  title: `Instrucțiunea ${number}`,
  category: 'work_activity',
  startWords,
  endWords,
});

const grinder = entry('XIII.I', grinderHeading, `Art. 6. ${sharedEnding}`);
const till = entry('XIII.II', tillHeading, sharedEnding);
const baker = entry(
  '1',
  bakerHeading,
  'La sfârșitul schimbului brutarul predă locul de muncă curat schimbului de zi.'
);

const firstLine = (text: string) => text.split('\n')[0];
const cutText = (location: { start: number; end: number }) =>
  ipssm.text.slice(location.start, location.end);

describe('cutInstructions', () => {
  it('cuts each instruction from its heading, past the table of contents, to its last paragraph', () => {
    const { instructions, unread } = cutInstructions('ssm', [ipssm], [grinder, till, baker]);

    expect(unread).toEqual([]);
    expect(instructions.map((cut) => cut.key)).toEqual(['ssm-1', 'ssm-2', 'ssm-3']);
    expect(firstLine(cutText(instructions[0]!.location))).toBe(grinderHeading);
    expect(cutText(instructions[0]!.location).endsWith(sharedEnding)).toBe(true);
    expect(firstLine(cutText(instructions[2]!.location))).toBe(bakerHeading);
    expect(instructions[2]!.location.lastParagraph).toBe(ipssm.paragraphs.length - 1);
  });

  it('keeps the pack’s article numbers and turns the cut into a body without its heading', () => {
    const [cut] = cutInstructions('ssm', [ipssm], [grinder]).instructions;

    expect(cut!.articles.map((item) => item.sourceNumber)).toEqual([4, 5, 6]);
    expect(cut!.body.blocks[0]).toEqual({
      kind: 'article',
      paragraphs: [
        'Mașina de tocat se pornește numai cu capacul de protecție montat și închis.',
        'a) carnea se împinge numai cu împingătorul din lemn livrat cu mașina;',
        'b) mâinile nu se introduc niciodată în gura de alimentare a mașinii.',
      ],
    });
    expect(cut!.flags).toEqual([]);
  });

  it('keeps two instructions with the same last sentence apart, in document order', () => {
    const { instructions } = cutInstructions('ssm', [ipssm], [grinder, till]);

    expect(instructions.map((cut) => cut.articles.map((item) => item.sourceNumber))).toEqual([
      [4, 5, 6],
      [7, 8, 9],
    ]);
  });

  it('finds quotes written without the printed numbers, without diacritics or in other case', () => {
    const plain = entry(
      'XIII.I',
      'SUBCAPITOLUL XIII.I. Instructiuni proprii privind utilizarea masinii de tocat carne',
      'carnea se impinge numai cu impingatorul din lemn livrat cu masina; mainile nu se introduc niciodata in gura de alimentare a masinii.'
    );

    const [cut] = cutInstructions('ssm', [ipssm], [plain]).instructions;

    expect(cut!.articles.map((item) => item.sourceNumber)).toEqual([4]);
  });

  it('finds an end quote with a wrong word by its last words', () => {
    const misquoted = entry(
      'XIII.II',
      tillHeading,
      'Cântarul electric se verifică metrologic la termenele prevăzute de lege. Ambalajele goale se strâng la sfârșitul fiecărei zile și se duc la containerul pentru hârtie și carton din spatele clădirii.'
    );

    const [cut] = cutInstructions('ssm', [ipssm], [grinder, misquoted]).instructions.slice(1);

    expect(cut!.articles.map((item) => item.sourceNumber)).toEqual([7, 8, 9]);
  });

  it('ends an instruction whose end is not found where the next one starts, and flags it', () => {
    const lost = {
      ...grinder,
      endWords: 'cuvinte care nu se află nicăieri în fișierul acesta de instrucțiuni',
    };

    const tillWithText = {
      ...till,
      startWords: `${tillHeading} Art. 7. Casa de marcat se folosește`,
    };

    const { instructions } = cutInstructions('ssm', [ipssm], [lost, tillWithText]);

    expect(instructions[0]!.articles.map((item) => item.sourceNumber)).toEqual([4, 5, 6]);
    expect(instructions[0]!.flags).toContainEqual({ kind: 'end_not_found' });
    expect(instructions[1]!.flags).toEqual([]);
  });

  it('runs on an instruction whose end quote stands inside it, up to the next one', () => {
    const early = {
      ...grinder,
      endWords: 'Înainte de curățare mașina se oprește și se scoate ștecherul din priză.',
    };

    const [cut] = cutInstructions('ssm', [ipssm], [early, till]).instructions;

    expect(cut!.articles.map((item) => item.sourceNumber)).toEqual([4, 5, 6]);
    expect(cut!.flags).toEqual([{ kind: 'end_extended' }]);
  });

  it('does not run on over the heading of an instruction the answer left out', () => {
    const early = {
      ...grinder,
      endWords: 'Înainte de curățare mașina se oprește și se scoate ștecherul din priză.',
    };

    const [cut] = cutInstructions('ssm', [ipssm], [early, baker]).instructions;

    expect(cut!.articles.map((item) => item.sourceNumber)).toEqual([4, 5]);
    expect(cut!.flags).toEqual([]);
  });

  it('runs an unfound end of the last instruction to the end of its file', () => {
    const lost = {
      ...baker,
      endWords: 'cuvinte care nu se află nicăieri în fișierul acesta de instrucțiuni',
    };

    const [cut] = cutInstructions('ssm', [ipssm], [lost]).instructions;

    expect(cut!.location.lastParagraph).toBe(ipssm.paragraphs.length - 1);
    expect(cut!.flags).toContainEqual({ kind: 'end_not_found' });
  });

  it.each([
    [
      'after an instruction whose end is not found',
      [
        { ...grinder, endWords: 'cuvinte care nu se află nicăieri în fișierul acesta' },
        till,
        baker,
      ],
    ],
    ['alone', [till]],
    ['before the instruction that comes first in the file', [till, grinder, baker]],
  ])(
    'does not cut over another instruction’s heading for an end the pack repeats, %s',
    (_, answer) => {
      const cut = cutInstructions('ssm', [ipssm], answer).instructions.find(
        (instruction) => instruction.number === 'XIII.II'
      );

      expect(firstLine(cutText(cut!.location))).toBe(tillHeading);
      expect(cut!.articles.map((item) => item.sourceNumber)).toEqual([7, 8, 9]);
      expect(cut!.flags).toEqual([]);
    }
  );

  it('does not start an instruction at its line in the table of contents', () => {
    const file = packFile('SSM/Cuprins.docx', [
      line('Lucrul cu scara de lemn din depozitul de făină ........ 3'),
      article(1, 'Sacii se ridică de doi lucrători.'),
      article(2, sharedEnding),
      line('Lucrul cu scara de lemn din depozitul de făină'),
      article(3, 'Scara se sprijină numai pe pardoseala uscată.'),
      article(4, sharedEnding),
    ]);
    const ladder = {
      ...till,
      file: file.path,
      startWords: 'Lucrul cu scara de lemn din depozitul de făină',
    };

    const [cut] = cutInstructions('ssm', [file], [ladder]).instructions;

    expect(cut!.articles.map((item) => item.sourceNumber)).toEqual([3, 4]);
  });

  it('lists an instruction whose start is not found as unread', () => {
    const lost = {
      ...till,
      startWords:
        'Subcapitolul XIII.IX. Instrucțiuni proprii privind lucrul cu stivuitorul electric',
    };

    const { instructions, unread } = cutInstructions('ssm', [ipssm], [grinder, lost]);

    expect(instructions.map((cut) => cut.key)).toEqual(['ssm-1']);
    expect(unread).toEqual([
      {
        key: 'ssm-2',
        file: ipssm.path,
        number: 'XIII.II',
        title: 'Instrucțiunea XIII.II',
        category: 'work_activity',
        reason: 'start_not_found',
      },
    ]);
  });

  it('lists an instruction of a file the import does not hold as unread', () => {
    const { unread } = cutInstructions('ssm', [ipssm], [{ ...grinder, file: 'SSM/Altul.docx' }]);

    expect(unread.map((item) => item.reason)).toEqual(['file_not_found']);
  });

  it('lists a cut without any article as unread', () => {
    const file = packFile('SSM/Gol.docx', [
      line('Subcapitolul XIII.I. Instrucțiuni proprii privind ceva fără niciun articol scris încă'),
      article(1, ''),
    ]);
    const empty = {
      ...grinder,
      file: file.path,
      startWords:
        'Subcapitolul XIII.I. Instrucțiuni proprii privind ceva fără niciun articol scris încă',
      endWords:
        'Subcapitolul XIII.I. Instrucțiuni proprii privind ceva fără niciun articol scris încă',
    };

    expect(cutInstructions('ssm', [file], [empty]).unread.map((item) => item.reason)).toEqual([
      'no_articles',
    ]);
  });

  it('cuts instructions from several files', () => {
    const single = packFile('SSM/Covid.docx', [
      line(
        'I.P.S.S.M. 6. Instrucțiuni proprii suplimentare privind igiena mâinilor în timpul programului'
      ),
      article(1, 'Mâinile se spală cu apă și săpun la intrarea în tură și după fiecare pauză.'),
    ]);

    const { instructions } = cutInstructions(
      'ssm',
      [ipssm, single],
      [
        grinder,
        {
          ...grinder,
          file: single.path,
          number: '6',
          startWords:
            'I.P.S.S.M. 6. Instrucțiuni proprii suplimentare privind igiena mâinilor în timpul programului',
          endWords: 'Mâinile se spală cu apă și săpun la intrarea în tură și după fiecare pauză.',
        },
      ]
    );

    expect(instructions.map((cut) => [cut.key, cut.file])).toEqual([
      ['ssm-1', ipssm.path],
      ['ssm-2', single.path],
    ]);
  });
});
