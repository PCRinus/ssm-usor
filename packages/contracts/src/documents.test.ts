import { describe, expect, it } from 'vitest';

import {
  datedDocumentTypeKeys,
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
} from './documents';
import { trainingSheetTypeKeys } from './training-sheets';

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
