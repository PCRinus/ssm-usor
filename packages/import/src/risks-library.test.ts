import { describe, expect, it } from 'vitest';

import {
  compareRiskSheets,
  descriptionTrigrams,
  jaccard,
  type LibraryEvaluation,
  type PackRiskFactor,
} from './risks-library';

const descriptions = [
  'Prinderea degetelor în malaxorul de aluat pornit',
  'Tăierea mâinilor cu cuțitul de feliat pâine',
  'Arsuri la scoaterea tăvilor din cuptorul electric',
  'Cădere pe pardoseala udă din brutărie',
  'Ridicarea sacilor de făină de cincizeci de kilograme',
  'Temperatură ridicată lângă cuptor în timpul verii',
  'Lucru în schimbul de noapte fără pauze',
  'Contact cu suprafețele fierbinți ale cuptorului',
  'Electrocutare la atingerea malaxorului cu cablul deteriorat',
  'Alunecare pe treptele de la intrarea în depozit',
];

const packFactors: PackRiskFactor[] = descriptions.map((description, index) => ({
  key: `sheet-1.${index + 1}`,
  component: index < 5 ? 'means_of_production' : 'executant',
  description,
  gravityClass: 2,
  probabilityClass: 3,
  measures: [],
}));

const entry = (id: string, factors: PackRiskFactor[]): LibraryEvaluation => ({
  id,
  name: id === 'e1' ? 'Brutar' : 'Altă evaluare',
  factors: factors.map((factor, index) => ({
    ...factor,
    id: `${id}-f${index + 1}`,
    component: factor.component!,
    gravityClass: factor.gravityClass!,
    probabilityClass: factor.probabilityClass!,
  })),
});

const compare = (
  library: LibraryEvaluation[],
  sheets = [{ key: 'sheet-1', name: 'Brutar', factors: packFactors }]
) =>
  compareRiskSheets({
    sheets,
    library,
    takenNames: library.map((item) => item.name),
    clientName: 'Brutăria din curte',
  });

describe('compareRiskSheets', () => {
  it('finds an identical entry one factor for one, in any order, and pairs the factors', () => {
    const [result] = compare([entry('e1', [...packFactors].reverse())]);

    expect(result).toMatchObject({ status: 'identical', name: 'Brutar' });
    expect(result!.match!.pairs).toHaveLength(10);
    expect(result!.match!.pairs[0]).toMatchObject({ factor: 'sheet-1.1', libraryFactor: 'e1-f10' });
  });

  it('is not identical once a class differs, but similar, with the factor shown as changed', () => {
    const changed = packFactors.map((factor, index) =>
      index === 0 ? { ...factor, gravityClass: 3 } : factor
    );
    const [result] = compare([entry('e1', changed)]);

    expect(result!.status).toBe('similar');
    expect(
      result!.match!.pairs.filter((pair) => pair.otherClasses).map((pair) => pair.factor)
    ).toEqual(['sheet-1.1']);
  });

  it('is similar at 70 % of the factors matched, with what only each side has', () => {
    const [result] = compare([entry('e1', packFactors.slice(0, 7))]);

    expect(result).toMatchObject({ status: 'similar', name: 'Brutar (Brutăria din curte)' });
    expect(result!.match).toMatchObject({
      share: 0.7,
      onlyInPack: ['sheet-1.8', 'sheet-1.9', 'sheet-1.10'],
      onlyInLibrary: [],
    });
  });

  it('is new below 70 %, and never pairs factors of different components', () => {
    expect(compare([entry('e1', packFactors.slice(0, 6))])[0]!.status).toBe('new');
    const moved = packFactors.map((factor) => ({ ...factor, component: 'work_task' as const }));
    expect(compare([entry('e1', moved)])[0]!.status).toBe('new');
  });

  it('pairs descriptions at a word-trigram Jaccard of 0.8 and not below', () => {
    const close = 'Ridicarea sacilor de făină de cincizeci de kilograme zilnic';
    const far = 'Ridicarea sacilor grei de făină de cincizeci de kilograme';
    expect(
      jaccard(descriptionTrigrams(descriptions[4]!), descriptionTrigrams(close))
    ).toBeGreaterThanOrEqual(0.8);
    expect(jaccard(descriptionTrigrams(descriptions[4]!), descriptionTrigrams(far))).toBeLessThan(
      0.8
    );

    const withClose = packFactors.map((factor, index) =>
      index === 4 ? { ...factor, description: close } : factor
    );
    const withFar = packFactors.map((factor, index) =>
      index === 4 ? { ...factor, description: far } : factor
    );
    expect(compare([entry('e1', withClose)])[0]!.match!.share).toBe(1);
    expect(compare([entry('e1', withFar)])[0]!.match!.onlyInPack).toEqual(['sheet-1.5']);
  });

  it('makes one entry of identical sheets of the pack', () => {
    const results = compare(
      [],
      [
        { key: 'sheet-1', name: 'Brutar', factors: packFactors },
        {
          key: 'sheet-2',
          name: 'Grupuri sensibile',
          factors: packFactors.map((factor) => ({ ...factor, key: `x${factor.key}` })),
        },
      ]
    );

    expect(results).toEqual([
      expect.objectContaining({ key: 'sheet-1', status: 'new', sameAs: ['sheet-2'] }),
    ]);
  });

  it('numbers a name the client’s name alone does not free', () => {
    const results = compareRiskSheets({
      sheets: [{ key: 'sheet-1', name: 'Brutar', factors: packFactors }],
      library: [],
      takenNames: ['Brutar', 'Brutar (Brutăria din curte)'],
      clientName: 'Brutăria din curte',
    });

    expect(results[0]!.name).toBe('Brutar (Brutăria din curte) 2');
  });
});
