import { describe, expect, it } from 'vitest';

import {
  buildDocumentContext,
  buildPartialDocumentContext,
  type DocumentFacts,
  missingDocumentData,
  waitingDocuments,
} from './context';
import { facts } from './context.fixture';
import { type RiskZoneFactorFacts, riskZonesGaps, riskZonesRecord } from './risk-zones-record';

const office = 'e0e0e0e0-0000-4000-8000-000000000001';
const workshop = 'e0e0e0e0-0000-4000-8000-000000000002';
const archived = 'e0e0e0e0-0000-4000-8000-000000000099';

const factor = (
  id: number,
  evaluationId: string,
  [gravityClass, probabilityClass]: [number, number],
  measures: RiskZoneFactorFacts['measures'] = [],
  sortOrder = 0
): RiskZoneFactorFacts => ({
  id: `f0f0f0f0-0000-4000-8000-0000000000${String(id).padStart(2, '0')}`,
  evaluationId,
  sortOrder,
  description: `Factorul ${id}.`,
  gravityClass,
  probabilityClass,
  measures,
});

const zone = (
  overrides: Partial<DocumentFacts['riskZones']['zones'][number]> = {}
): DocumentFacts['riskZones']['zones'][number] => ({
  name: 'Zona',
  workplace: null,
  location: null,
  measures: null,
  factors: [],
  ...overrides,
});

const withZones = (
  zones: DocumentFacts['riskZones']['zones'],
  state: DocumentFacts['riskZones']['state'] = 'listed'
): DocumentFacts => ({ ...facts, riskZones: { state, zones } });

describe('what 9.2 waits for', () => {
  it('waits for the client to list its zones or declare it has none', () => {
    expect(riskZonesGaps(withZones([], 'undecided'))).toEqual(['risk_zones.decided']);
    expect(riskZonesGaps(withZones([], 'none'))).toEqual([]);
    expect(riskZonesGaps(facts)).toEqual([]);
  });

  it('waits for the measures of a zone that would print none', () => {
    const measured = [{ kind: 'technical' as const, description: 'Împământare.' }];
    const left = zone({ factors: [factor(1, archived, [5, 3], measured)] });
    expect(riskZonesGaps(withZones([left]))).toEqual(['risk_zones.measures']);
    expect(riskZonesGaps(withZones([{ ...left, measures: ' \n – \n' }]))).toEqual([
      'risk_zones.measures',
    ]);
    expect(riskZonesGaps(withZones([{ ...left, measures: 'Acces restricționat.' }]))).toEqual([]);
    const bare = zone({ factors: [factor(2, office, [2, 2])] });
    expect(riskZonesGaps(withZones([bare]))).toEqual(['risk_zones.measures']);
    expect(
      riskZonesGaps(
        withZones([
          zone({ factors: [factor(2, office, [2, 2], [{ kind: 'other', description: ' ' }])] }),
        ])
      )
    ).toEqual(['risk_zones.measures']);
    expect(
      riskZonesGaps(
        withZones([
          zone({ factors: [factor(2, office, [2, 2], [{ kind: 'other', description: '.' }])] }),
        ])
      )
    ).toEqual(['risk_zones.measures']);
    expect(riskZonesGaps(withZones([{ ...bare, measures: 'Acces restricționat.' }]))).toEqual([]);
    expect(
      riskZonesGaps(withZones([zone({ factors: [factor(2, office, [2, 2], measured)] })]))
    ).toEqual([]);
  });

  it('keeps the rest of the set from waiting for it', () => {
    const undecided = withZones([], 'undecided');
    expect(missingDocumentData(undecided)).toEqual([]);
    expect(missingDocumentData(undecided, 'prevention_plan')).toEqual([]);
    expect(missingDocumentData(undecided, 'risk_zones_record')).toEqual(['risk_zones.decided']);
    expect(waitingDocuments(undecided)).toEqual([
      { typeKey: 'risk_zones_record', missing: ['risk_zones.decided'] },
    ]);
    expect(waitingDocuments(facts)).toEqual([]);
  });

  it('leaves the zones out of the context rather than print them undecided', () => {
    const undecided = withZones([], 'undecided');
    expect(buildDocumentContext(undecided).riskZones).toBeUndefined();
    expect(buildDocumentContext(undecided).riskAssessment).toBeDefined();
    expect(buildPartialDocumentContext(undecided, 'risk_zones_record').riskZones).toBeUndefined();
  });
});

describe('the record of risk zones', () => {
  it('says the client has none, with no zone', () => {
    expect(riskZonesRecord(withZones([], 'none'))).toEqual({
      state: 'none',
      listed: false,
      none: true,
      zones: [],
    });
  });

  it('prints the zones in the order they were added', () => {
    const zones = [zone({ name: 'B', measures: 'Una.' }), zone({ name: ' A ', measures: 'Alta.' })];
    expect(riskZonesRecord(withZones(zones))!.zones.map((each) => each.name)).toEqual(['B', 'A']);
  });

  it('places a zone at its workplace, as 9.1 names it, and its location, or a dash', () => {
    const record = riskZonesRecord(
      withZones([
        zone({
          workplace: { name: 'Atelier Ghiroda', registeredOffice: false },
          location: ' parter ',
          measures: 'Una.',
        }),
        zone({ workplace: { name: 'Sediul social', registeredOffice: true }, measures: 'Una.' }),
        zone({ location: 'curtea interioară', measures: 'Una.' }),
        zone({ measures: 'Una.' }),
      ])
    )!;
    expect(record.zones.map((each) => each.place)).toEqual([
      'Punct de lucru „Atelier Ghiroda”\nparter',
      'Sediu social',
      'curtea interioară',
      '—',
    ]);
    expect(record.zones[0]).toMatchObject({
      workplace: 'Punct de lucru „Atelier Ghiroda”',
      location: 'parter',
    });
  });

  it("prints only the current factors, the highest level first, then in 9.1's order", () => {
    const record = riskZonesRecord(
      withZones([
        zone({
          factors: [
            factor(1, workshop, [2, 2]),
            factor(2, archived, [7, 6]),
            factor(3, office, [5, 3], [], 1),
            factor(4, workshop, [5, 3]),
            factor(5, office, [2, 2], [], 0),
          ],
          measures: 'Acces restricționat.',
        }),
      ])
    )!;
    // The office's post, Contabil, comes before the workshop's, Sudor, in 9.1.
    expect(record.zones[0]!.risks).toEqual([
      { description: 'Factorul 3.', level: 4 },
      { description: 'Factorul 4.', level: 4 },
      { description: 'Factorul 5.', level: 2 },
      { description: 'Factorul 1.', level: 2 },
    ]);
    expect(record.zones[0]!.risksText).toBe(
      [
        '– Factorul 3 (nivel de risc 4)',
        '– Factorul 4 (nivel de risc 4)',
        '– Factorul 5 (nivel de risc 2)',
        '– Factorul 1 (nivel de risc 2)',
      ].join('\n')
    );
  });

  it("prints each measure once, by kind, then the zone's own, a line each", () => {
    const record = riskZonesRecord(
      withZones([
        zone({
          measures: '- Acces numai cu permis.\n- Ușa încuiată',
          factors: [
            factor(
              1,
              office,
              [5, 3],
              [
                { kind: 'other', description: 'Semnalizare.' },
                { kind: 'organizational', description: 'Instruire.' },
                { kind: 'technical', description: 'Ușa încuiată.' },
              ]
            ),
            factor(
              2,
              office,
              [4, 2],
              [
                { kind: 'technical', description: 'Împământare.' },
                { kind: 'organizational', description: ' instruire ' },
                { kind: 'hygienic_sanitary', description: 'Aerisire.' },
              ]
            ),
          ],
        }),
      ])
    )!;
    expect(record.zones[0]!.measures).toEqual([
      'Ușa încuiată.',
      'Împământare.',
      'Instruire.',
      'Aerisire.',
      'Semnalizare.',
      'Acces numai cu permis.',
    ]);
    expect(record.zones[0]!.measuresText).toBe(
      record.zones[0]!.measures.map((measure) => `– ${measure}`).join('\n')
    );
  });

  it('prints a lone risk or measure as text, and a dash for a zone without factors', () => {
    const record = riskZonesRecord(
      withZones([
        zone({ factors: [factor(1, office, [3, 3], [{ kind: 'technical', description: 'X.' }])] }),
        zone({ measures: 'Acces restricționat.' }),
      ])
    )!;
    expect(record.zones.map(({ risksText, measuresText }) => [risksText, measuresText])).toEqual([
      ['Factorul 1 (nivel de risc 3)', 'X.'],
      ['—', 'Acces restricționat.'],
    ]);
  });

  it('changes with a linked factor, which marks a generated 9.2 as changed', () => {
    const before = buildDocumentContext(facts).riskZones;
    const changed: DocumentFacts = {
      ...facts,
      riskZones: {
        ...facts.riskZones,
        zones: facts.riskZones.zones.map((each, index) =>
          index === 0
            ? {
                ...each,
                factors: each.factors.map((linked) => ({ ...linked, probabilityClass: 6 })),
              }
            : each
        ),
      },
    };
    expect(buildDocumentContext(changed).riskZones).not.toEqual(before);
  });
});
