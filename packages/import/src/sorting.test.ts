import { describe, expect, it } from 'vitest';

import { type FileTriage, libraryFiles, sortFiles, sortingAnswer } from './sorting';
import { provider } from './test/fixtures';

const triage = (
  path: string,
  kind: FileTriage['kind'],
  companyName: string | null,
  companyCui: string | null,
  carriesClientData = true,
  domain: FileTriage['domain'] = null
) => ({ path, triage: { path, kind, companyName, companyCui, carriesClientData, domain } });

const pack = [
  triage('Decizia 1.docx', 'decision', 'BRUTĂRIA FICTIVĂ S.R.L.', 'RO 12345674'),
  triage('Evaluare.doc', 'risk_assessment', 'Brutaria Fictiva', null),
  triage('PSI/Lista.doc', 'fire_safety_document', 'S.C. BRUTĂRIA FICTIVĂ S.R.L.', '12345674'),
  triage('Coperta.docx', 'cover', 'Brutăria Fictivă', null, false),
  triage('Instructaj.doc', 'generic_text', null, null, false),
  triage('Instructiuni.doc', 'own_instructions', 'Brutăria Fictivă', null),
  triage('Tematica.doc', 'training_themes', 'Brutăria Fictivă', null, false),
  triage('Fise/Georgescu.jpg', 'training_sheet', 'Brutăria Fictivă', null),
  triage('Contract.docx', 'contract', provider.name, provider.cui),
  triage('Vechi/Decizia 1.doc', 'decision', 'ATELIERUL INVENTAT S.R.L.', '11122232'),
  triage('Vechi/Plan.doc', 'risk_assessment', 'Atelierul Inventat', null),
  { path: 'Scan decizie.pdf', triage: null },
];

describe('sortFiles', () => {
  it('imports the company most files name and offers the others separately', () => {
    const sorting = sortFiles(pack, { provider });

    expect(sorting.company).toEqual({ name: 'BRUTĂRIA FICTIVĂ S.R.L.', cui: '12345674' });
    expect(Object.fromEntries(sorting.files.map(({ path, ...rest }) => [path, rest]))).toEqual({
      'Decizia 1.docx': { outcome: 'read' },
      'Evaluare.doc': { outcome: 'read' },
      'PSI/Lista.doc': { outcome: 'read' },
      'Coperta.docx': { outcome: 'set_aside', kind: 'cover' },
      'Instructaj.doc': { outcome: 'set_aside', kind: 'generic_text' },
      'Instructiuni.doc': { outcome: 'set_aside', kind: 'own_instructions' },
      'Tematica.doc': { outcome: 'read' },
      'Fise/Georgescu.jpg': { outcome: 'employee_import' },
      'Contract.docx': { outcome: 'read' },
      'Vechi/Decizia 1.doc': {
        outcome: 'other_company',
        company: { name: 'ATELIERUL INVENTAT S.R.L.', cui: '11122232' },
      },
      'Vechi/Plan.doc': {
        outcome: 'other_company',
        company: { name: 'ATELIERUL INVENTAT S.R.L.', cui: '11122232' },
      },
      'Scan decizie.pdf': { outcome: 'read' },
    });
    expect(sorting.otherCompanies).toEqual([
      {
        company: { name: 'ATELIERUL INVENTAT S.R.L.', cui: '11122232' },
        paths: ['Vechi/Decizia 1.doc', 'Vechi/Plan.doc'],
      },
    ]);
  });

  it('keeps an import into an existing client to that client, even outnumbered', () => {
    const sorting = sortFiles(
      [
        triage('Vechi/Decizia 1.doc', 'decision', 'ATELIERUL INVENTAT S.R.L.', '11122232'),
        triage('Vechi/Plan.doc', 'risk_assessment', 'Atelierul Inventat', null),
        triage('Decizia 1.docx', 'decision', 'Brutăria Fictivă', null),
      ],
      { provider, client: { legalName: 'BRUTĂRIA FICTIVĂ S.R.L.', cui: '12345674' } }
    );

    expect(sorting.company).toEqual({ name: 'BRUTĂRIA FICTIVĂ S.R.L.', cui: '12345674' });
    expect(sorting.files.map((file) => file.outcome)).toEqual([
      'other_company',
      'other_company',
      'read',
    ]);
  });

  it('does not take a client whose name starts like the provider’s for the provider', () => {
    const sorting = sortFiles(
      [
        triage('Decizia 1.docx', 'decision', 'PROTECȚIE CONSTRUCT S.R.L.', null),
        triage('Contract.docx', 'contract', 'Protect SRL', null),
      ],
      { provider: { name: 'PROTECT S.R.L.', cui: '76543210' } }
    );

    expect(sorting.company).toEqual({ name: 'PROTECȚIE CONSTRUCT S.R.L.', cui: null });
  });

  it('sets the general training material aside even when told it carries client data', () => {
    const sorting = sortFiles([
      triage('Decizia 1.docx', 'decision', 'Brutăria Fictivă', null),
      triage('MISSMIG.doc', 'training_material', 'Brutăria Fictivă', null, true),
      triage('Tematica.doc', 'training_themes', 'Brutăria Fictivă', null, true),
    ]);

    expect(sorting.files).toEqual([
      { path: 'Decizia 1.docx', outcome: 'read' },
      { path: 'MISSMIG.doc', outcome: 'set_aside', kind: 'training_material' },
      { path: 'Tematica.doc', outcome: 'read' },
    ]);
  });

  it('knows a sole trader’s files whether its form is written with points or without', () => {
    const sorting = sortFiles([
      triage('Decizia 1.docx', 'decision', 'VASILESCU M.ANA P.F.A.', '12345674'),
      triage('Evaluare.doc', 'risk_assessment', 'VASILESCU M.ANA P.F.A.', null),
      triage('Tematica control.docx', 'decision', 'VASILESCU M. ANA PFA', null),
    ]);

    expect(sorting.otherCompanies).toEqual([]);
    expect(sorting.files.map((file) => file.outcome)).toEqual(['read', 'read', 'read']);
  });

  const notaryPack = [
    triage('Contract SSM.pdf', 'contract', 'SOCIETATE PROFESIONALA NOTARIALA STANCIUC', '37516222'),
    triage('Contract SU.pdf', 'contract', 'SOCIETATE PROFESIONALA NOTARIALA STANCIUC.', '37516222'),
    triage('Decizie SSM.docx', 'decision', 'SOCIETATE PROFESIONALA NOTARIALA STANCIUC', null),
    triage('Decizie.docx', 'decision', 'S.P.N. / STANCIUC', null),
    triage('Evaluare riscuri.docx', 'risk_assessment', 'S.P.N. / STANCIUC', null),
    triage('Tematica SSM.docx', 'training_themes', 'S.P.N. / STANCIUC', null),
    triage('Plan prevenire.docx', 'risk_assessment', 'SPN STANCIUC', null),
  ];

  it('keeps a notary office whose files write its form spelled out, as initials or both', () => {
    const sorting = sortFiles(notaryPack, { provider });

    expect(sorting.company).toEqual({
      name: 'SOCIETATE PROFESIONALA NOTARIALA STANCIUC',
      cui: '37516222',
    });
    expect(sorting.otherCompanies).toEqual([]);
    expect(sorting.files.every((file) => file.outcome === 'read')).toBe(true);
  });

  it('keeps those files to the client being completed under its registered name', () => {
    const sorting = sortFiles(notaryPack, {
      provider,
      client: { legalName: 'SOCIETATEA PROFESIONALA NOTARIALA STANCIUC', cui: '37516222' },
    });

    expect(sorting.otherCompanies).toEqual([]);
    expect(sorting.files.every((file) => file.outcome === 'read')).toBe(true);
  });

  it('knows a sole trader whose form one file spells out', () => {
    const sorting = sortFiles([
      triage('Decizia 1.docx', 'decision', 'Casapu Mircea Adrian PFA', '12345674'),
      triage(
        'Evaluare.doc',
        'risk_assessment',
        'Casapu Mircea Adrian Persoană Fizică Autorizată',
        null
      ),
    ]);

    expect(sorting.otherCompanies).toEqual([]);
  });

  it('knows a sole trader whose files write II after the name and one spells it out', () => {
    const sorting = sortFiles([
      triage('Contract.pdf', 'contract', 'POPESCU ION INTREPRINDERE INDIVIDUALA', '12345674'),
      triage('Decizia 1.docx', 'decision', 'Popescu Ion II', null),
      triage('Evaluare.doc', 'risk_assessment', 'Popescu Ion II', null),
    ]);

    expect(sorting.company).toEqual({
      name: 'POPESCU ION INTREPRINDERE INDIVIDUALA',
      cui: '12345674',
    });
    expect(sorting.otherCompanies).toEqual([]);
  });

  it('keeps apart two offices whose names differ only in their legal form', () => {
    const sorting = sortFiles([
      triage('Contract.pdf', 'contract', 'Cabinet de avocat Ionescu', '12345674'),
      triage('Decizia 1.docx', 'decision', 'Cabinet de avocat Ionescu', null),
      triage('Fisa medicala.pdf', 'other', 'Cabinet medical individual Ionescu', null),
    ]);

    expect(sorting.otherCompanies.map(({ company }) => company.name)).toEqual([
      'Cabinet medical individual Ionescu',
    ]);
  });

  it.each([
    ['ALFA II S.R.L.', ['Alfa II', 'Alfa II']],
    ['SCM IMPEX SRL', ['SCM Impex', 'S.C.M. Impex S.R.L.']],
    ['Arta IF SRL', ['Arta IF']],
    ['BIN Trans SRL', ['BIN Trans']],
    ['Spn Trans SRL', ['SPN Trans']],
    ['IF Construct SRL', ['IF Construct']],
    [
      'CABINET MEDICAL INDIVIDUAL DR. POPESCU ION',
      [
        'Cabinet Medical Dr. Popescu Ion',
        'Cabinet Medical Dr. Popescu Ion',
        'Dr. Popescu Ion - Cabinet Medical Individual',
        'CMI Dr. Popescu Ion',
      ],
    ],
    ['BIROUL INDIVIDUAL NOTARIAL POPESCU ANA', ['Biroul Notarial Individual Popescu Ana']],
    ['SOCIETATEA COOPERATIVA MESTESUGAREASCA UNIREA', ['S.C.M. Unirea', 'S.C.M. UNIREA']],
    ['S.C.A. POPESCU SI ASOCIATII', ['SCA Popescu și Asociații']],
    ['S.C.P.E.J. MARINESCU SI ASOCIATII', ['SCPEJ Marinescu și Asociații']],
  ])('keeps the files of %j that name it %j with its CUI', (registered, written) => {
    const sorting = sortFiles([
      triage('Contract.pdf', 'contract', registered, '12345674'),
      ...written.map((name, index) => triage(`Decizia ${index}.docx`, 'decision', name, null)),
    ]);

    expect(sorting.company).toEqual({ name: registered, cui: '12345674' });
    expect(sorting.otherCompanies).toEqual([]);
  });

  it('keeps the files of a client being completed whose documents write the form otherwise', () => {
    const sorting = sortFiles(
      [
        triage('Decizia 1.docx', 'decision', 'Cabinet de avocat Ionescu Maria', null),
        triage('Evaluare.doc', 'risk_assessment', 'Cabinet de avocat Ionescu Maria', null),
      ],
      { client: { legalName: 'CABINET AVOCAT IONESCU MARIA', cui: '12345674' } }
    );

    expect(sorting.otherCompanies).toEqual([]);
  });

  it('groups names without a CUI the same whatever the order of the files', () => {
    const names = ['Alfa', 'Alfa SA', 'Alfa SRL', 'Alfa SA'];
    const orders = [
      [0, 1, 2, 3],
      [1, 2, 3, 0],
      [2, 0, 3, 1],
      [3, 2, 1, 0],
    ];
    const outcomes = orders.map((order) => {
      const sorting = sortFiles(
        order.map((index) => triage(`${index}.docx`, 'decision', names[index]!, null))
      );
      return {
        company: sorting.company,
        apart: sorting.otherCompanies.map(({ paths }) => [...paths].sort()),
      };
    });

    expect(outcomes[0]).toEqual({
      company: { name: 'Alfa SA', cui: null },
      apart: [['2.docx']],
    });
    for (const outcome of outcomes) expect(outcome).toEqual(outcomes[0]);
  });

  it('names no company when no file names one', () => {
    const sorting = sortFiles([triage('Decizia.docx', 'decision', null, null)]);

    expect(sorting).toEqual({
      company: null,
      files: [{ path: 'Decizia.docx', outcome: 'read' }],
      otherCompanies: [],
    });
  });
});

describe('sortingAnswer', () => {
  it('reads "" as unknown', () => {
    expect(
      sortingAnswer.parse({
        files: [
          {
            path: 'Coperta.docx',
            kind: 'cover',
            companyName: '',
            companyCui: '',
            carriesClientData: false,
          },
        ],
      })
    ).toEqual({
      files: [
        {
          path: 'Coperta.docx',
          kind: 'cover',
          companyName: null,
          companyCui: null,
          carriesClientData: false,
          domain: null,
        },
      ],
    });
  });

  it('keeps a domain only for own instructions and training themes', () => {
    const file = (path: string, kind: string, domain: string) => ({
      path,
      kind,
      companyName: '',
      companyCui: '',
      carriesClientData: true,
      domain,
    });

    expect(
      sortingAnswer
        .parse({
          files: [
            file('IPSU.docx', 'own_instructions', 'su'),
            file('Tematica.doc', 'training_themes', 'ssm'),
            file('Decizia.docx', 'decision', 'ssm'),
            file('IPSSM.docx', 'own_instructions', ''),
          ],
        })
        .files.map((triage) => [triage.path, triage.domain])
    ).toEqual([
      ['IPSU.docx', 'su'],
      ['Tematica.doc', 'ssm'],
      ['Decizia.docx', null],
      ['IPSSM.docx', null],
    ]);
  });
});

describe('libraryFiles', () => {
  it('gives each domain its own instructions and themes, of the client only', () => {
    const entries = [
      triage('SSM/IPSSM.docx', 'own_instructions', 'Brutăria Fictivă', null, true, 'ssm'),
      triage('PSI/IPSU.docx', 'own_instructions', 'Brutăria Fictivă', null, true, 'su'),
      triage('SSM/Tematica.doc', 'training_themes', 'Brutăria Fictivă', null, true, 'ssm'),
      triage('PSI/Tematica SU.doc', 'training_themes', 'Brutăria Fictivă', null, true, 'su'),
      triage('Fara domeniu.docx', 'own_instructions', 'Brutăria Fictivă', null, true, null),
      triage('Decizia.docx', 'decision', 'Brutăria Fictivă', null),
      triage(
        'Vechi/IPSSM.docx',
        'own_instructions',
        'ATELIERUL INVENTAT S.R.L.',
        '11122232',
        true,
        'ssm'
      ),
      triage('Vechi/Decizia.docx', 'decision', 'ATELIERUL INVENTAT S.R.L.', '11122232'),
    ];
    const sorting = sortFiles(entries, {
      client: { legalName: 'BRUTĂRIA FICTIVĂ S.R.L.', cui: '12345674' },
    });

    expect(
      libraryFiles(sorting, new Map(entries.map((entry) => [entry.path, entry.triage])))
    ).toEqual({
      ssm: { instructions: ['SSM/IPSSM.docx'], themes: ['SSM/Tematica.doc'] },
      su: { instructions: ['PSI/IPSU.docx'], themes: ['PSI/Tematica SU.doc'] },
    });
  });
});
