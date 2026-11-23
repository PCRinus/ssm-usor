import type { RiskZoneFactor } from '@ssm-usor/contracts';
import { describe, expect, it } from 'vitest';

import {
  factorGroups,
  ownMeasureLines,
  printedMeasures,
  suggestionSource,
} from './risk-zone-model';

const post = (n: number, title: string) =>
  ({ id: `e${n}`, kind: 'job_position', title, jobPositionId: `p${n}` }) as const;
const visitors = { id: 'e9', kind: 'other', title: 'Vizitatori', jobPositionId: null } as const;

const factor = (
  id: string,
  evaluation: RiskZoneFactor['evaluation'],
  riskLevel: number,
  measures: [RiskZoneFactor['measures'][number]['kind'], string][] = []
): RiskZoneFactor => ({
  id,
  component: 'executant',
  group: 'Acțiuni greșite',
  description: id,
  riskLevel,
  evaluation,
  measures: measures.map(([kind, description], index) => ({
    id: `${id}-${index}`,
    kind,
    description,
  })),
});

describe('the measures 9.2 prints for a zone', () => {
  it('takes each text once across kinds and factors, by kind, then the zone’s own lines', () => {
    const measures = printedMeasures(
      [
        factor('a', post(1, 'Sudor'), 5, [
          ['organizational', 'Instruire periodică'],
          ['technical', 'Ecran de protecție'],
        ]),
        factor('b', post(2, 'Lăcătuș'), 4, [
          ['technical', '  instruire  PERIODICĂ. '],
          ['hygienic_sanitary', 'Spălător de ochi'],
        ]),
      ],
      '- Acces restricționat\n\n• Spălător de ochi;\nIndicator de pericol'
    );
    expect(measures).toEqual({
      byKind: [
        { kind: 'technical', texts: ['Ecran de protecție', 'instruire  PERIODICĂ.'] },
        { kind: 'hygienic_sanitary', texts: ['Spălător de ochi'] },
      ],
      own: ['Acces restricționat', 'Indicator de pericol'],
    });
  });

  it('splits the zone’s own measures into lines without their bullets', () => {
    expect(ownMeasureLines('– Prima\n* A doua\n   \n- A treia')).toEqual([
      'Prima',
      'A doua',
      'A treia',
    ]);
    expect(ownMeasureLines(null)).toEqual([]);
  });
});

describe('where a suggestion comes from', () => {
  it('names the posts whose work zone it is, and the evaluations outside the posts', () => {
    const cook = post(1, 'Bucătar');
    const helper = post(2, 'Ajutor de bucătar');
    expect(
      suggestionSource({
        origin: 'work_zone',
        factors: [factor('a', cook, 6), factor('b', helper, 5), factor('c', cook, 4)],
      }).map((part) => [part.lead, part.evaluations.map((evaluation) => evaluation.title)])
    ).toEqual([['Zona de lucru a posturilor', ['Bucătar', 'Ajutor de bucătar']]]);
    expect(
      suggestionSource({
        origin: 'work_zone',
        factors: [factor('a', cook, 6), factor('v', visitors, 4)],
      }).map((part) => part.lead)
    ).toEqual(['Zona de lucru a postului', 'Fișa de evaluare']);
  });

  it('names the sheet when the suggestion is named after it', () => {
    expect(
      suggestionSource({ origin: 'evaluation', factors: [factor('a', post(3, 'Casier'), 4)] })[0]!
        .lead
    ).toBe('Fișa de evaluare a postului');
  });
});

describe('the factors offered to a zone', () => {
  it('groups them by evaluation, the unacceptable first, and keeps a linked factor no longer offered', () => {
    const welder = post(1, 'Sudor');
    const gone = post(7, 'Sudor vechi');
    const groups = factorGroups(
      [factor('low', welder, 2), factor('high', welder, 6), factor('v', visitors, 3)],
      [factor('high', welder, 6), factor('old', gone, 5)]
    );
    expect(groups.map((group) => [group.evaluation.title, group.factors.map((f) => f.id)])).toEqual(
      [
        ['Sudor', ['high', 'low']],
        ['Vizitatori', ['v']],
        ['Sudor vechi', ['old']],
      ]
    );
  });
});
