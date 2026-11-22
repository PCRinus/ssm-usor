import { describe, expect, it } from 'vitest';

import {
  datedDocumentTypeKeys,
  documentNumberOf,
  documentSetGroups,
  documentSetOf,
  documentSetQuerySchema,
  documentSets,
  documentSetTypeKeys,
  documentUploadQuerySchema,
  fireDecisionNumber,
  fireDecisionOrdinals,
  fireDecisionTypeKeys,
  fireSafetyDocumentTypeKeys,
  fireSafetyTypeKeysFromTenEmployees,
  generateDocumentsRequestSchema,
  isDatedDocumentType,
  maxFirstFireDecisionNumber,
  numberedTitle,
} from './documents';
import { trainingSheetTypeKeys } from './training-sheets';

describe('documentNumberOf', () => {
  it.each(documentSets)('numbers every built-in type of the %s set, each once', (set) => {
    const numbers = documentSetTypeKeys[set].map(documentNumberOf);
    expect(numbers.filter((number) => number === null)).toEqual([]);
    expect(new Set(numbers).size).toBe(numbers.length);
  });

  it.each(documentSets)(
    'numbers the documents after a cover of the %s set X.1, X.2, … without a gap',
    (set) => {
      const numbers = documentSetTypeKeys[set].map((typeKey) => documentNumberOf(typeKey)!);
      const coveredSections = numbers
        .filter((number) => number.endsWith('.0'))
        .map((cover) => cover.split('.')[0]);
      expect(coveredSections.length).toBeGreaterThan(4);
      for (const section of coveredSections) {
        const places = numbers
          .filter((number) => number.startsWith(`${section}.`))
          .map((number) => Number(number.split('.')[1]))
          .sort((a, b) => a - b);
        expect(places).toEqual(places.map((_, index) => index));
      }
    }
  );

  it.each(documentSets)(
    'numbers the documents of a section of the %s set without a cover X.1, X.2, … without a gap',
    (set) => {
      const numbers = documentSetTypeKeys[set].map((typeKey) => documentNumberOf(typeKey)!);
      const sections = new Set(
        numbers.filter((number) => number.includes('.')).map((number) => number.split('.')[0])
      );
      const uncovered = [...sections].filter((section) => !numbers.includes(`${section}.0`));
      for (const section of uncovered) {
        const places = numbers
          .filter((number) => number.startsWith(`${section}.`))
          .map((number) => Number(number.split('.')[1]));
        expect(places).toEqual(places.map((_, index) => index + 1));
      }
    }
  );

  it('numbers the risk assessment and the record of risk zones 9.1 and 9.2, in that order', () => {
    const typeKeys = documentSetTypeKeys.occupational_safety;
    expect(
      typeKeys.slice(typeKeys.indexOf('risk_assessment'), typeKeys.indexOf('prevention_plan'))
    ).toEqual(['risk_assessment', 'risk_zones_record']);
    expect(typeKeys.map(documentNumberOf).filter((number) => number?.startsWith('9.'))).toEqual([
      '9.1',
      '9.2',
    ]);
  });

  it('numbers no type outside the binder', () => {
    expect(Object.values(trainingSheetTypeKeys).map(documentNumberOf)).toEqual([null, null]);
    expect(documentNumberOf('provider_own_form')).toBeNull();
    expect(documentNumberOf('constructor')).toBeNull();
  });
});

describe('numberedTitle', () => {
  it('puts the binder number before the title', () => {
    expect(
      numberedTitle('own_instructions', 'Instrucțiuni proprii de securitate și sănătate în muncă')
    ).toBe('3.1 Instrucțiuni proprii de securitate și sănătate în muncă');
    expect(numberedTitle('fire_annual_report', 'Raport anual de evaluare 2026')).toBe(
      '7.2 Raport anual de evaluare 2026'
    );
  });

  it('leaves the title alone for a type outside the binder', () => {
    expect(numberedTitle('service_contract', 'Contract de prestări servicii')).toBe(
      'Contract de prestări servicii'
    );
  });
});

describe('documentSetOf', () => {
  it.each(documentSets)('places every built-in type of the %s set in it', (set) => {
    expect(documentSetTypeKeys[set].map(documentSetOf)).toEqual(
      documentSetTypeKeys[set].map(() => set)
    );
  });

  it('places a type no list names by its prefix', () => {
    expect(documentSetOf('fire_smoking_decision')).toBe('fire_safety');
    expect(documentSetOf('provider_own_form')).toBe('occupational_safety');
  });
});

describe('the sets', () => {
  it('share no type key', () => {
    const occupational = new Set<string>(documentSetTypeKeys.occupational_safety);
    expect(fireSafetyDocumentTypeKeys.filter((key) => occupational.has(key))).toEqual([]);
  });

  it('hold none of the individual training sheets, which belong to an employee', () => {
    const inSets = new Set<string>(Object.values(documentSetTypeKeys).flat());
    expect(Object.values(trainingSheetTypeKeys).filter((key) => inSets.has(key))).toEqual([]);
  });

  it('each have a group of their own', () => {
    expect(new Set(Object.values(documentSetGroups)).size).toBe(documentSets.length);
  });

  it('default to the occupational safety one when a request names none', () => {
    expect(documentSetQuerySchema.parse({})).toEqual({ set: 'occupational_safety' });
    expect(documentSetQuerySchema.parse({ set: 'fire_safety' })).toEqual({ set: 'fire_safety' });
    expect(documentSetQuerySchema.safeParse({ set: 'other' }).success).toBe(false);
  });
});

describe('generateDocumentsRequestSchema', () => {
  it('leaves the first decision number to the set, which decides whether it is required', () => {
    expect(generateDocumentsRequestSchema.parse({ issueDate: '2026-10-06' })).toEqual({
      issueDate: '2026-10-06',
    });
    expect(
      generateDocumentsRequestSchema.parse({ issueDate: '2026-10-06', firstDecisionNumber: 4 })
    ).toEqual({ issueDate: '2026-10-06', firstDecisionNumber: 4 });
  });
});

describe('the dated document types', () => {
  it('are built-in types of a set, the annual report first', () => {
    const builtIn: readonly string[] = [
      ...documentSetTypeKeys.occupational_safety,
      ...documentSetTypeKeys.fire_safety,
    ];
    expect(datedDocumentTypeKeys.filter((typeKey) => !builtIn.includes(typeKey))).toEqual([]);
    expect(isDatedDocumentType('fire_annual_report')).toBe(true);
    expect(isDatedDocumentType('fire_site_sheet')).toBe(false);
  });

  it('take a year from 2000 to 2100 as their period, at generation and at upload', () => {
    expect(generateDocumentsRequestSchema.parse({ issueDate: '2026-10-06', period: 2025 })).toEqual(
      { issueDate: '2026-10-06', period: 2025 }
    );
    expect(
      generateDocumentsRequestSchema.safeParse({ issueDate: '2026-10-06', period: 1999 }).success
    ).toBe(false);
    expect(documentUploadQuerySchema.parse({ period: '2025' })).toEqual({ period: 2025 });
    expect(documentUploadQuerySchema.parse({})).toEqual({});
    expect(documentUploadQuerySchema.safeParse({ period: '25' }).success).toBe(false);
  });
});

describe('the fire-safety decisions', () => {
  it('keep their places in the binder, whatever is built between them', () => {
    expect(
      Object.values(fireDecisionTypeKeys).map((typeKey) => fireDecisionNumber(typeKey, 1))
    ).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(fireDecisionNumber('fire_decision_waste', 11)).toBe(17);
    expect(fireDecisionNumber('fire_means_list', 11)).toBeNull();
    expect(fireDecisionNumber('decision_training', 11)).toBeNull();
  });

  it('are fire-safety types of the set', () => {
    expect(
      Object.values(fireDecisionTypeKeys).filter(
        (typeKey) => !(fireSafetyDocumentTypeKeys as readonly string[]).includes(typeKey)
      )
    ).toEqual([]);
  });

  it('fill the nine places of the binder, each once', () => {
    expect(Object.values(fireDecisionOrdinals).sort((a, b) => a - b)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9,
    ]);
  });

  it('end with the ones required from ten employees, so a smaller client has no gap', () => {
    const fromTen: readonly string[] = fireSafetyTypeKeysFromTenEmployees;
    expect(
      Object.values(fireDecisionTypeKeys)
        .filter((typeKey) => fromTen.includes(typeKey))
        .map((typeKey) => fireDecisionNumber(typeKey, 1))
    ).toEqual([8, 9]);
  });

  it('are listed in the set in the order of their numbers', () => {
    const decisions = fireSafetyDocumentTypeKeys.filter((typeKey) =>
      (Object.values(fireDecisionTypeKeys) as string[]).includes(typeKey)
    );
    expect(decisions.map((typeKey) => fireDecisionNumber(typeKey, 1))).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9,
    ]);
  });

  it('leave room for the ninth decision under the four-digit limit', () => {
    expect(maxFirstFireDecisionNumber + 9 - 1).toBe(9999);
    expect(Math.max(...Object.values(fireDecisionOrdinals))).toBeLessThanOrEqual(9);
  });
});
