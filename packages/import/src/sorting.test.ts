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
            file('IPSU.docx', 'own_instructions', 'psi'),
            file('Tematica.doc', 'training_themes', 'ssm'),
            file('Decizia.docx', 'decision', 'ssm'),
            file('IPSSM.docx', 'own_instructions', ''),
          ],
        })
        .files.map((triage) => [triage.path, triage.domain])
    ).toEqual([
      ['IPSU.docx', 'psi'],
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
      triage('PSI/IPSU.docx', 'own_instructions', 'Brutăria Fictivă', null, true, 'psi'),
      triage('SSM/Tematica.doc', 'training_themes', 'Brutăria Fictivă', null, true, 'ssm'),
      triage('PSI/Tematica SU.doc', 'training_themes', 'Brutăria Fictivă', null, true, 'psi'),
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
      psi: { instructions: ['PSI/IPSU.docx'], themes: ['PSI/Tematica SU.doc'] },
    });
  });
});
