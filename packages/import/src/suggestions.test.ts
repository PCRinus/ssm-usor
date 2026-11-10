import { describe, expect, it } from 'vitest';

import { checkAllowedValues, checkQuotes } from './checks';
import { proposalSchema } from './proposal';
import { fromWire, type Reading, readingAnswer, toProposal } from './reading';

type Suggestion = Reading['workplaceSuggestions'][number];

const decision = 'Dosar/SSM/Decizia 1 puncte de lucru.docx';
const riskEvaluation = 'Dosar/SSM/Evaluarea riscurilor.docx';
const wasteDecision = 'Dosar/PSI/Decizia 9 deșeuri.docx';
const sheet = 'Dosar/PSI/Instrucțiuni afișate.docx';

const workplace = (
  name: string,
  overrides: Partial<Reading['workplaces'][number]> = {}
): Reading['workplaces'][number] => ({
  name,
  county: 'CJ',
  locality: 'Cluj-Napoca',
  addressLine: name === 'Sediu' ? 'Str. Florilor nr. 3, ap. 4' : 'Str. Morii nr. 12',
  isRegisteredOffice: name === 'Sediu',
  activity: name === 'Sediu' ? null : 'Atelier de tâmplărie',
  rooms: [],
  file: decision,
  quote: `${name}: ${name === 'Sediu' ? 'Str. Florilor nr. 3, ap. 4' : 'Str. Morii nr. 12'}`,
  otherCompany: null,
  ...overrides,
});

const reading = (overrides: Partial<Reading> = {}): Reading => ({
  facts: [],
  workplaces: [workplace('Atelier')],
  workplaceFacts: [],
  workplaceSuggestions: [],
  jobPositions: [],
  jobPositionFacts: [],
  responsiblePersons: [],
  fireEquipment: [],
  fireInstallations: [],
  substances: [],
  protectiveEquipment: [],
  employees: [],
  notes: [],
  ...overrides,
});

const materials: Suggestion = {
  workplace: 'Atelier',
  field: 'combustibleMaterials',
  value: 'rumeguș, talaș, plăci din PAL, lacuri și diluanți',
  sources: [
    { file: riskEvaluation, quote: 'Materiale: plăci PAL, cherestea, lacuri, diluanți' },
    { file: wasteDecision, quote: 'deșeuri de rumeguș și talaș' },
  ],
};

const norm: Suggestion = {
  workplace: 'Atelier',
  field: 'extinguisherNorm',
  value: 'other_150',
  sources: [{ file: riskEvaluation, quote: 'Activitate: fabricarea mobilei (CAEN 3109)' }],
};

describe('suggested values', () => {
  it('suggests a value no document states, with every passage it was drawn from', () => {
    const proposal = toProposal(reading({ workplaceSuggestions: [materials, norm] }));
    const [atelier] = proposal.workplaces;

    expect(atelier).toMatchObject({
      combustibleMaterials: 'rumeguș, talaș, plăci din PAL, lacuri și diluanți',
      extinguisherNorm: 'other_150',
      suggested: {
        combustibleMaterials: materials.sources,
        extinguisherNorm: norm.sources,
      },
      fieldSources: {},
      spelling: {},
    });
  });

  it('reads a value a document states and suggests nothing for it', () => {
    const proposal = toProposal(
      reading({
        workplaceFacts: [
          {
            workplace: 'Atelier',
            field: 'combustibleMaterials',
            value: 'cherestea, PAL',
            file: sheet,
            quote: 'I.1 Materiale combustibile: cherestea, PAL',
            otherCompany: null,
          },
        ],
        workplaceSuggestions: [materials],
      })
    );

    expect(proposal.workplaces[0]).toMatchObject({
      combustibleMaterials: 'cherestea, PAL',
      suggested: {},
      fieldSources: {
        combustibleMaterials: [
          { file: sheet, quote: 'I.1 Materiale combustibile: cherestea, PAL' },
        ],
      },
    });
  });

  it('joins a suggestion given twice, and drops one with no passage or no workplace', () => {
    const proposal = toProposal(
      reading({
        workplaceSuggestions: [
          materials,
          {
            ...materials,
            value: 'Rumeguș, talaș, plăci din PAL, lacuri și diluanți',
            sources: [{ file: sheet, quote: 'atelier de tâmplărie' }],
          },
          { ...materials, field: 'ignitionSources', value: 'scântei', sources: [] },
          { ...materials, workplace: 'Depozit Sud', field: 'specificMeasures' },
        ],
      })
    );

    expect(proposal.workplaces[0]!.suggested).toEqual({
      combustibleMaterials: [...materials.sources, { file: sheet, quote: 'atelier de tâmplărie' }],
    });
    expect(proposal.workplaces[0]!.ignitionSources).toBeNull();
    expect(proposal.workplaces[0]!.specificMeasures).toBeNull();
  });

  it('suggests no norm for a mobile site, and nothing for a workplace only another company gives', () => {
    const proposal = toProposal(
      reading({
        workplaces: [
          workplace('Atelier'),
          workplace('Șantier', { otherCompany: 'Alfa Construct', addressLine: 'Str. Lungă nr. 1' }),
        ],
        workplaceFacts: [
          {
            workplace: 'Atelier',
            field: 'kind',
            value: 'mobile_site',
            file: sheet,
            quote: 'șantier temporar sau mobil',
            otherCompany: null,
          },
        ],
        workplaceSuggestions: [materials, norm, { ...materials, workplace: 'Șantier' }],
      })
    );

    expect(proposal.workplaces[0]).toMatchObject({
      kind: 'mobile_site',
      extinguisherNorm: null,
      combustibleMaterials: materials.value,
    });
    expect(Object.keys(proposal.workplaces[0]!.suggested)).toEqual(['combustibleMaterials']);
    expect(proposal.workplaces[1]!.suggested).toEqual({});
  });

  it('flags a passage not found in its file, and a value outside its column or its norms', () => {
    const proposal = toProposal(
      reading({
        workplaceSuggestions: [
          materials,
          { ...norm, value: 'Clădiri industriale' },
          { ...materials, field: 'specificMeasures', value: 'x'.repeat(601) },
        ],
      })
    );
    const files = {
      [decision]: 'Atelier: Str. Morii nr. 12',
      [riskEvaluation]:
        'Materiale: plăci PAL, cherestea, lacuri, diluanți. Activitate: fabricarea mobilei (CAEN 3109)',
      [wasteDecision]: 'Se colectează deșeuri de lemn.',
    };

    expect(checkQuotes(proposal, files)).toEqual([
      { path: 'workplaces.0.suggested.combustibleMaterials.sources.1', code: 'quote_not_found' },
      { path: 'workplaces.0.suggested.specificMeasures.sources.1', code: 'quote_not_found' },
    ]);
    expect(checkAllowedValues(proposal)).toEqual([
      { path: 'workplaces.0.extinguisherNorm', code: 'value_not_allowed' },
      { path: 'workplaces.0.specificMeasures', code: 'value_not_allowed' },
    ]);
  });

  it('reads the suggestions from the wire form', () => {
    const wire = {
      ...reading(),
      workplaces: [
        { ...workplace('Atelier'), county: 'CJ', otherCompany: '', activity: 'Tâmplărie' },
      ],
      workplaceSuggestions: [materials],
    };

    expect(fromWire(wire).workplaces[0]!.suggested.combustibleMaterials).toEqual(materials.sources);
    expect(JSON.stringify(readingAnswer.jsonSchema)).toContain('workplaceSuggestions');
  });

  it('reads a page read before the suggestions, and a proposal stored before them', () => {
    const before: Partial<Reading> = reading();
    delete before.workplaceSuggestions;
    const proposal = toProposal(before as Reading);
    expect(proposal.workplaces[0]).toMatchObject({ suggested: {}, officeHasActivity: true });

    const stored: Record<string, unknown> = { ...proposal.workplaces[0]! };
    delete stored.suggested;
    delete stored.officeHasActivity;
    const reopened = proposalSchema.parse({ ...proposal, workplaces: [stored] });
    expect(reopened.workplaces[0]).toMatchObject({ suggested: {}, officeHasActivity: true });
  });
});

describe('a registered office with no activity', () => {
  const office = toProposal(reading({ workplaces: [workplace('Sediu'), workplace('Atelier')] }));

  it('is suggested where the documents name a point of work and place nothing at the office', () => {
    expect(office.workplaces[0]).toMatchObject({
      isRegisteredOffice: true,
      officeHasActivity: false,
      suggested: {
        officeHasActivity: [{ file: decision, quote: 'Atelier: Str. Morii nr. 12' }],
      },
    });
    expect(office.workplaces[1]).toMatchObject({ officeHasActivity: true, suggested: {} });
  });

  it.each([
    ['a room', { workplaces: [workplace('Sediu', { rooms: ['Birou'] }), workplace('Atelier')] }],
    [
      'an activity',
      { workplaces: [workplace('Sediu', { activity: 'Birouri' }), workplace('Atelier')] },
    ],
    [
      'a value of its fire-safety sheet',
      {
        workplaces: [workplace('Sediu'), workplace('Atelier')],
        workplaceFacts: [
          {
            workplace: 'Sediu',
            field: 'floorAreaM2' as const,
            value: '40',
            file: sheet,
            quote: 'suprafața utilă 40 mp',
            otherCompany: null,
          },
        ],
      },
    ],
    [
      'a means of fire defence',
      {
        workplaces: [workplace('Sediu'), workplace('Atelier')],
        fireEquipment: [
          {
            workplace: 'Sediu',
            room: null,
            kind: 'extinguisher' as const,
            agent: 'powder' as const,
            capacity: 6,
            wheeled: false,
            count: 1,
            file: sheet,
            quote: 'Sediu: stingător P6',
            otherCompany: null,
          },
        ],
      },
    ],
    [
      'an installation',
      {
        workplaces: [workplace('Sediu'), workplace('Atelier')],
        fireInstallations: [
          {
            workplace: 'Sediu',
            kind: 'detection_alarm' as const,
            description: null,
            file: sheet,
            quote: 'Sediu: detectoare de fum',
            otherCompany: null,
          },
        ],
      },
    ],
    [
      'a person heading it',
      {
        workplaces: [workplace('Sediu'), workplace('Atelier')],
        responsiblePersons: [
          {
            fullName: 'Pop Ana',
            jobTitle: 'Administrator',
            roles: [
              {
                role: 'workplace_manager' as const,
                file: decision,
                quote: 'Pop Ana conduce activitatea de la sediu',
              },
            ],
            workplace: 'Sediu',
            file: decision,
            quote: 'Pop Ana',
            otherCompany: null,
          },
        ],
      },
    ],
  ])('is not suggested where the documents place %s at the office', (_, overrides) => {
    const proposal = toProposal(reading(overrides as Partial<Reading>));
    expect(proposal.workplaces[0]).toMatchObject({ officeHasActivity: true, suggested: {} });
  });

  it('is not suggested without a point of work of the client', () => {
    for (const workplaces of [
      [workplace('Sediu')],
      [workplace('Sediu'), workplace('Atelier', { otherCompany: 'Alfa Construct' })],
    ]) {
      const proposal = toProposal(reading({ workplaces }));
      expect(proposal.workplaces[0]).toMatchObject({ officeHasActivity: true, suggested: {} });
    }
  });

  it('leaves the office its suggested card values, for when the member says activity takes place', () => {
    const proposal = toProposal(
      reading({
        workplaces: [workplace('Sediu'), workplace('Atelier')],
        workplaceSuggestions: [{ ...materials, workplace: 'Sediu', value: 'hârtie, mobilier' }],
      })
    );
    expect(proposal.workplaces[0]).toMatchObject({
      officeHasActivity: false,
      combustibleMaterials: 'hârtie, mobilier',
    });
    expect(Object.keys(proposal.workplaces[0]!.suggested).sort()).toEqual([
      'combustibleMaterials',
      'officeHasActivity',
    ]);
  });
});
