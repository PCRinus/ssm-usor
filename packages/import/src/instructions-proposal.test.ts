import { describe, expect, it } from 'vitest';

import type { LibraryModule } from './instructions-library';
import {
  libraryTitle,
  pairsToJudge,
  proposeInstructions,
  readInstructionsAnswer,
} from './instructions-proposal';
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

describe('libraryTitle', () => {
  it('drops the lead every own instruction shares', () => {
    expect(
      libraryTitle(
        'Instructiuni proprii in domeniul securitatii si sanatatii in munca privind utilizarea autoturismelor in interes de serviciu'
      )
    ).toBe('Utilizarea autoturismelor in interes de serviciu');
    expect(
      libraryTitle(
        'Instrucţiuni proprii pentru securitatea si sanatatea in munca pentru activitati desfasurate in birouri'
      )
    ).toBe('Activitati desfasurate in birouri');
    expect(
      libraryTitle(
        'INSTRUCTIUNI DE APĂRARE ÎMPOTRIVA INCENDIILOR SPECIFICE ACTIVITATILOR DESFASURATE IN SPATII PENTRU COMERT'
      )
    ).toBe('Spatii pentru comert');
  });

  it('keeps a title without that lead as written', () => {
    expect(libraryTitle('Utilizarea feliatorului')).toBe('Utilizarea feliatorului');
    expect(libraryTitle('Instrucțiuni proprii în domeniul securității în muncă')).toBe(
      'Instrucțiuni proprii în domeniul securității în muncă'
    );
  });
});

const named = packFile('SSM/Client.docx', [
  line(
    'Subcapitolul XIII.I. Instrucțiuni proprii privind folosirea frigiderului din laboratorul de cofetărie'
  ),
  article(1, 'Frigiderul S.C. BRUTĂRIA FICTIVĂ S.R.L. se curăță săptămânal, după ce a fost oprit.'),
]);

const answer: InstructionsAnswer = {
  instructions: [
    {
      file: ipssm.path,
      number: 'XIII.I',
      title: 'Instrucțiuni proprii privind utilizarea mașinii de tocat carne la brutăria din curte',
      category: 'work_equipment',
      startWords: grinderHeading,
      endWords: sharedEnding,
    },
    {
      file: ipssm.path,
      number: 'XIII.II',
      title: 'Instrucțiuni proprii privind lucrul la casa de marcat',
      category: 'work_equipment',
      startWords: `${tillHeading} Art. 7. Casa de marcat`,
      endWords: sharedEnding,
    },
    {
      file: ipssm.path,
      number: '1',
      title:
        'Instrucțiuni proprii privind activitățile desfășurate de brutarii din schimbul de noapte',
      category: 'work_activity',
      startWords: bakerHeading,
      endWords: 'brutarul predă locul de muncă curat schimbului de zi.',
    },
    {
      file: named.path,
      number: 'XIII.I',
      title: 'Instrucțiuni proprii privind folosirea frigiderului',
      category: 'work_equipment',
      startWords:
        'Subcapitolul XIII.I. Instrucțiuni proprii privind folosirea frigiderului din laboratorul de cofetărie',
      endWords:
        'Frigiderul S.C. BRUTĂRIA FICTIVĂ S.R.L. se curăță săptămânal, după ce a fost oprit.',
    },
  ],
  positions: [
    {
      post: 'BRUTAR',
      variant: '',
      clientPost: 'Brutar',
      section: 'workplace',
      citation: 'IPSSM Art. 1 – 6 ; IPSSM 1. Art. 1 – 3',
      file: 'SSM/Tematica.doc',
      quote: 'FUNCTIA : BRUTAR … IPSSM Art. 1 – 6 ; IPSSM 1. Art. 1 – 3',
    },
    {
      post: 'VANZATOR',
      variant: '',
      clientPost: 'Vânzător',
      section: 'workplace',
      citation: 'IPSSM Art. 1 – 3 ; 7 – 8',
      file: 'SSM/Tematica.doc',
      quote: 'FUNCTIA : VANZATOR … IPSSM Art. 1 – 3 ; 7 – 8',
    },
  ],
};

const client = { name: 'Brutăria Fictivă', legalName: 'BRUTĂRIA FICTIVĂ S.R.L.' };

describe('proposeInstructions', () => {
  it('cuts the pack, resolves the posts and compares each instruction with the library', async () => {
    const read = readInstructionsAnswer('ssm', [ipssm, named], answer);
    const library: LibraryModule[] = [
      {
        id: 'm-1',
        title: 'Utilizarea mașinii de tocat carne la brutăria din curte',
        category: 'work_equipment',
        domain: 'ssm',
        body: read.instructions[0]!.body,
      },
    ];

    const proposal = await proposeInstructions({ read, library, client });

    expect(proposal.positions.map((position) => position.resolution)).toEqual([
      { kind: 'resolved', instructions: ['ssm-1', 'ssm-3'] },
      { kind: 'undecided', reasons: [{ kind: 'cuts_instruction', instruction: 'ssm-2' }] },
    ]);
    expect(
      proposal.instructions.map((item) => [item.key, item.status, item.title, item.posts])
    ).toEqual([
      [
        'ssm-1',
        'identical',
        'Utilizarea mașinii de tocat carne la brutăria din curte (Brutăria Fictivă)',
        ['ssm-post-1'],
      ],
      ['ssm-2', 'new', 'Lucrul la casa de marcat', []],
      [
        'ssm-3',
        'new',
        'Activitățile desfășurate de brutarii din schimbul de noapte',
        ['ssm-post-1'],
      ],
      ['ssm-4', 'new', 'Folosirea frigiderului', []],
    ]);
    expect(proposal.instructions[3]!.flags).toEqual([
      { kind: 'client_name', name: 'BRUTĂRIA FICTIVĂ S.R.L.' },
    ]);
    expect(proposal.instructions[1]!.sourceNumbers).toEqual([7, 8, 9]);
    expect(await pairsToJudge(read, library)).toEqual([]);
  });

  it('applies an instruction the pack holds twice to the posts that cite either copy', async () => {
    const twice = packFile('SSM/3.2._IPSSM.docx', [
      line(
        'Subcapitolul XIII.I. Instrucțiuni proprii privind lucrul cu cuptorul electric al laboratorului'
      ),
      article(
        4,
        'Cuptorul se pornește numai după ce s-a verificat ștecherul și cablul de alimentare.'
      ),
      line(
        'Subcapitolul XIII.II. Instrucțiuni proprii privind lucrul cu cuptorul electric al magazinului'
      ),
      article(
        5,
        'Cuptorul se pornește numai după ce s-a verificat ștecherul și cablul de alimentare.'
      ),
    ]);
    const entry = (number: string, place: string) => ({
      file: twice.path,
      number,
      title: `Lucrul cu cuptorul electric al ${place}`,
      category: 'work_equipment' as const,
      startWords: `Subcapitolul ${number}. Instrucțiuni proprii privind lucrul cu cuptorul electric al ${place}`,
      endWords:
        'Cuptorul se pornește numai după ce s-a verificat ștecherul și cablul de alimentare.',
    });
    const read = readInstructionsAnswer('ssm', [twice], {
      instructions: [entry('XIII.I', 'laboratorului'), entry('XIII.II', 'magazinului')],
      positions: [
        { ...answer.positions[0]!, citation: 'IPSSM Art. 5' },
        { ...answer.positions[1]!, citation: 'IPSSM Art. 4' },
      ],
    });

    const proposal = await proposeInstructions({ read, library: [], client });

    expect(proposal.instructions.map((item) => [item.key, item.sameAs, item.posts])).toEqual([
      ['ssm-1', ['ssm-2'], ['ssm-post-1', 'ssm-post-2']],
    ]);
    expect(proposal.positions.map((position) => position.resolution)).toEqual([
      { kind: 'resolved', instructions: ['ssm-1'] },
      { kind: 'resolved', instructions: ['ssm-1'] },
    ]);
  });
});
